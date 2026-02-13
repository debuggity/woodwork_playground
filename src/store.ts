import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import * as THREE from 'three';
import { PartData, ToolType } from './types';

const toQuaternion = (rotation: [number, number, number]) =>
  new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation[0], rotation[1], rotation[2], 'XYZ'));

const toEulerTuple = (quaternion: THREE.Quaternion): [number, number, number] => {
  const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');
  return [euler.x, euler.y, euler.z];
};

const DEFAULT_HINGE_MIN_ANGLE = THREE.MathUtils.degToRad(-110);
const DEFAULT_HINGE_MAX_ANGLE = THREE.MathUtils.degToRad(110);

const getHingePinOffset = (hinge: PartData) => {
  const fallback = Math.max(hinge.dimensions[0] * 0.35, 0.2);
  return hinge.hinge?.pinOffset ?? fallback;
};

const getHingeLimits = (hinge: PartData) => {
  const min = hinge.hinge?.minAngle;
  const max = hinge.hinge?.maxAngle;
  if (min === undefined && max === undefined) {
    return [DEFAULT_HINGE_MIN_ANGLE, DEFAULT_HINGE_MAX_ANGLE] as const;
  }

  const ordered = [
    Math.min(min ?? DEFAULT_HINGE_MIN_ANGLE, max ?? DEFAULT_HINGE_MAX_ANGLE),
    Math.max(min ?? DEFAULT_HINGE_MIN_ANGLE, max ?? DEFAULT_HINGE_MAX_ANGLE),
  ] as const;

  // Migrate legacy one-way hinge range (0..180 deg) to centered bidirectional range.
  if (Math.abs(ordered[0]) <= 0.0001 && Math.abs(ordered[1] - Math.PI) <= 0.0001) {
    return [DEFAULT_HINGE_MIN_ANGLE, DEFAULT_HINGE_MAX_ANGLE] as const;
  }

  return ordered;
};

const getHingeWorldQuaternion = (hinge: PartData) => {
  const baseRotation = toQuaternion(hinge.rotation);
  const hingeSwing = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    hinge.hinge?.angle ?? 0
  );
  return baseRotation.multiply(hingeSwing);
};

const getHingePivotWorldPosition = (hinge: PartData) => {
  const baseRotation = toQuaternion(hinge.rotation);
  const pinOffset = getHingePinOffset(hinge);
  const pivotLocal = new THREE.Vector3(pinOffset, 0, 0);
  return new THREE.Vector3(...hinge.position).add(pivotLocal.applyQuaternion(baseRotation));
};

const updateAttachedPartsForHinge = (parts: PartData[], hingeId: string): PartData[] => {
  const hinge = parts.find((part) => part.id === hingeId);
  if (!hinge || hinge.hardwareKind !== 'hinge') return parts;

  const hingePivotPos = getHingePivotWorldPosition(hinge);
  const hingeWorldQuat = getHingeWorldQuaternion(hinge);

  return parts.map((part) => {
    const attachment = part.attachment;
    if (!attachment || attachment.hingeId !== hingeId) {
      return part;
    }

    const worldPos = new THREE.Vector3(...attachment.localPosition)
      .applyQuaternion(hingeWorldQuat)
      .add(hingePivotPos);

    const localRot = toQuaternion(attachment.localRotation);
    const worldRot = hingeWorldQuat.clone().multiply(localRot);

    return {
      ...part,
      position: [worldPos.x, worldPos.y, worldPos.z],
      rotation: toEulerTuple(worldRot),
    };
  });
};

const rebuildAllAttachments = (parts: PartData[]) => {
  const normalized = parts.map((part) => {
    if (part.hardwareKind !== 'hinge') return part;
    const [minAngle, maxAngle] = getHingeLimits(part);
    const angle = Math.max(minAngle, Math.min(maxAngle, part.hinge?.angle ?? 0));
    return {
      ...part,
      hinge: {
        angle,
        minAngle,
        maxAngle,
        pinOffset: getHingePinOffset(part),
      },
    };
  });

  const hingeIds = normalized.filter((part) => part.hardwareKind === 'hinge').map((hinge) => hinge.id);
  return hingeIds.reduce((acc, hingeId) => updateAttachedPartsForHinge(acc, hingeId), normalized);
};

type AutoScrewResult = {
  ok: boolean;
  message: string;
  screwCount: number;
};

type OrientedFrame = {
  center: THREE.Vector3;
  half: [number, number, number];
  axes: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
};

type ScrewPreset = {
  name: string;
  length: number;
  diameter: number;
};

const AUTO_SCREW_CONTACT_GAP_TOLERANCE = 0.45;
const AUTO_SCREW_OVERLAP_MIN = 0.3;
const AUTO_SCREW_MIN_PENETRATION = 0.12;
const AUTO_SCREW_REQUIRED_COUNT = 2;
const AUTO_SCREW_MIN_DIR_ALIGNMENT = 0.22;
const AUTO_SCREW_MAX_AXIS_OVERLAP = 0.55;
const AUTO_SCREW_PRESETS: ScrewPreset[] = [
  { name: '#8 x 1-1/4" Wood Screw', length: 1.25, diameter: 0.164 },
  { name: '#10 x 2-1/2" Wood Screw', length: 2.5, diameter: 0.19 },
  { name: '#12 x 3" Wood Screw', length: 3, diameter: 0.216 },
];

const buildOrientedFrame = (part: PartData): OrientedFrame => {
  const quaternion = toQuaternion(part.rotation);
  return {
    center: new THREE.Vector3(...part.position),
    half: [part.dimensions[0] / 2, part.dimensions[1] / 2, part.dimensions[2] / 2],
    axes: [
      new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion).normalize(),
      new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion).normalize(),
      new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion).normalize(),
    ],
  };
};

const getProjectionRadius = (frame: OrientedFrame, direction: THREE.Vector3) => {
  const dir = direction.clone().normalize();
  return (
    Math.abs(dir.dot(frame.axes[0])) * frame.half[0]
    + Math.abs(dir.dot(frame.axes[1])) * frame.half[1]
    + Math.abs(dir.dot(frame.axes[2])) * frame.half[2]
  );
};

const getProjectedRange = (frame: OrientedFrame, direction: THREE.Vector3) => {
  const dir = direction.clone().normalize();
  const center = frame.center.dot(dir);
  const radius = getProjectionRadius(frame, dir);
  return {
    min: center - radius,
    max: center + radius,
  };
};

const getLinePointCoordsInFrame = (
  frame: OrientedFrame,
  linePoint: THREE.Vector3
) => {
  const delta = linePoint.clone().sub(frame.center);
  return [
    delta.dot(frame.axes[0]),
    delta.dot(frame.axes[1]),
    delta.dot(frame.axes[2]),
  ] as const;
};

const intersectLineWithFrame = (
  frame: OrientedFrame,
  linePoint: THREE.Vector3,
  lineDir: THREE.Vector3,
  tolerance = 0.01
) => {
  const localPoint = getLinePointCoordsInFrame(frame, linePoint);
  const localDir = [
    lineDir.dot(frame.axes[0]),
    lineDir.dot(frame.axes[1]),
    lineDir.dot(frame.axes[2]),
  ] as const;

  let tMin = -Infinity;
  let tMax = Infinity;

  for (let axis = 0; axis < 3; axis += 1) {
    const p = localPoint[axis];
    const d = localDir[axis];
    const half = frame.half[axis] + tolerance;

    if (Math.abs(d) < 1e-6) {
      if (Math.abs(p) > half) {
        return null;
      }
      continue;
    }

    const t1 = (-half - p) / d;
    const t2 = (half - p) / d;
    const enter = Math.min(t1, t2);
    const exit = Math.max(t1, t2);
    tMin = Math.max(tMin, enter);
    tMax = Math.min(tMax, exit);
    if (tMin > tMax) {
      return null;
    }
  }

  return {
    start: tMin,
    end: tMax,
    length: Math.max(0, tMax - tMin),
  };
};

const getIntervalGap = (
  a: { start: number; end: number },
  b: { start: number; end: number }
) => {
  if (a.end < b.start) return b.start - a.end;
  if (b.end < a.start) return a.start - b.end;
  return 0;
};

const getIntervalOverlap = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));

const chooseScrewSegment = (
  firstLine: { start: number; end: number },
  secondLine: { start: number; end: number }
) => {
  const overlapStart = Math.max(firstLine.start, secondLine.start);
  const overlapEnd = Math.min(firstLine.end, secondLine.end);
  const hasOverlap = overlapEnd > overlapStart;
  const seamCenter = hasOverlap
    ? (overlapStart + overlapEnd) / 2
    : (
        (firstLine.end < secondLine.start)
          ? (firstLine.end + secondLine.start) / 2
          : (secondLine.end + firstLine.start) / 2
      );

  const lengthCandidates = AUTO_SCREW_PRESETS.map((preset) => preset.length);

  const centerOffsets = [0, -0.125, 0.125, -0.25, 0.25, -0.5, 0.5, -0.75, 0.75, -1, 1];
  const centerCandidates = centerOffsets.map((offset) => seamCenter + offset);
  if (hasOverlap) {
    centerCandidates.push((firstLine.start + firstLine.end) / 2, (secondLine.start + secondLine.end) / 2);
  }

  let best:
    | {
        center: number;
        preset: ScrewPreset;
        overlapFirst: number;
        overlapSecond: number;
        score: number;
      }
    | null = null;

  for (const center of centerCandidates) {
    for (const length of lengthCandidates) {
      const segmentStart = center - length / 2;
      const segmentEnd = center + length / 2;
      const overlapFirst = getIntervalOverlap(segmentStart, segmentEnd, firstLine.start, firstLine.end);
      const overlapSecond = getIntervalOverlap(segmentStart, segmentEnd, secondLine.start, secondLine.end);
      if (overlapFirst < AUTO_SCREW_MIN_PENETRATION || overlapSecond < AUTO_SCREW_MIN_PENETRATION) {
        continue;
      }

      const preset = AUTO_SCREW_PRESETS.find((item) => Math.abs(item.length - length) < 0.0001);
      if (!preset) {
        continue;
      }

      const score =
        overlapFirst
        + overlapSecond
        - Math.abs(length - 2.5) * 0.06
        - Math.abs(center - seamCenter) * 0.05;

      if (!best || score > best.score) {
        best = {
          center,
          preset,
          overlapFirst,
          overlapSecond,
          score,
        };
      }
    }
  }

  return best;
};

const getSampleCoords = (min: number, max: number) => {
  const span = max - min;
  const center = (min + max) / 2;
  const values = [center];

  if (span >= 0.55) {
    values.push(min + span * 0.18, max - span * 0.18);
  }
  if (span >= 1.2) {
    values.push(min + span * 0.33, max - span * 0.33);
  }
  if (span >= 2.6) {
    values.push(min + span * 0.08, max - span * 0.08);
  }

  const sorted = values.sort((a, b) => a - b);
  const deduped: number[] = [];
  sorted.forEach((value) => {
    if (deduped.length === 0 || Math.abs(deduped[deduped.length - 1] - value) > 0.08) {
      deduped.push(value);
    }
  });
  return deduped;
};

const getBasisForDirection = (direction: THREE.Vector3) => {
  const dir = direction.clone().normalize();
  const helper = Math.abs(dir.y) < 0.94 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = helper.clone().cross(dir).normalize();
  const v = dir.clone().cross(u).normalize();
  return { dir, u, v };
};

const getBasisCandidatesForDirection = (direction: THREE.Vector3) => {
  const dir = direction.clone().normalize();
  const helpers = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(1, 1, 0).normalize(),
    new THREE.Vector3(1, 0, 1).normalize(),
    new THREE.Vector3(0, 1, 1).normalize(),
  ];

  const bases: Array<{ dir: THREE.Vector3; u: THREE.Vector3; v: THREE.Vector3 }> = [];
  const pushBasis = (uAxis: THREE.Vector3) => {
    const u = uAxis.clone().normalize();
    if (u.lengthSq() < 0.9) return;
    const exists = bases.some((candidate) => Math.abs(candidate.u.dot(u)) > 0.985);
    if (exists) return;
    const v = dir.clone().cross(u).normalize();
    bases.push({ dir, u, v });
  };

  helpers.forEach((helper) => {
    const u = helper.clone().cross(dir);
    if (u.lengthSq() < 1e-4) return;
    pushBasis(u);
  });

  if (bases.length === 0) {
    const fallback = getBasisForDirection(dir);
    bases.push(fallback);
  }
  return bases;
};

const getDirectionCandidates = (
  firstFrame: OrientedFrame,
  secondFrame: OrientedFrame,
  centerDelta: THREE.Vector3
) => {
  const candidates: THREE.Vector3[] = [];
  const consume = (axis: THREE.Vector3) => {
    const dir = axis.clone().normalize();
    if (centerDelta.dot(dir) < 0) {
      dir.multiplyScalar(-1);
    }

    const exists = candidates.some((item) => Math.abs(item.dot(dir)) > 0.985);
    if (!exists) {
      candidates.push(dir);
    }
  };

  firstFrame.axes.forEach(consume);
  secondFrame.axes.forEach(consume);

  return candidates;
};

interface AppState {
  parts: PartData[];
  selectedId: string | null;
  hoveredId: string | null;
  tool: ToolType;
  explodeFactor: number;
  cameraFocusRequest: number;
  
  addPart: (part: PartData) => void;
  updatePart: (id: string, updates: Partial<PartData>) => void;
  removePart: (id: string) => void;
  selectPart: (id: string | null) => void;
  setHoveredId: (id: string | null) => void;
  duplicatePart: (id: string, options?: { selectDuplicate?: boolean }) => void;
  attachPartToHinge: (partId: string, hingeId: string) => void;
  detachPartFromHinge: (partId: string) => void;
  setHingeAngle: (hingeId: string, angle: number) => void;
  autoScrewParts: (firstId: string, secondId: string) => AutoScrewResult;
  setTool: (tool: ToolType) => void;
  resetScene: () => void;
  setParts: (parts: PartData[]) => void;
  snapEnabled: boolean;
  toggleSnap: () => void;
  floorEnabled: boolean;
  toggleFloor: () => void;
  requestCameraFocus: () => void;
  setExplodeFactor: (value: number) => void;
}

export const useStore = create<AppState>((set) => ({
  parts: [],
  selectedId: null,
  hoveredId: null,
  tool: 'select',
  explodeFactor: 0,
  cameraFocusRequest: 0,
  snapEnabled: true, // Default to true for easier alignment
  floorEnabled: false,

  addPart: (part) => set((state) => ({ 
    parts: [...state.parts, part],
    selectedId: part.id 
  })),

  updatePart: (id, updates) => set((state) => {
    const current = state.parts.find((part) => part.id === id);
    const detachingAttachment = Boolean(
      current?.attachment && (updates.position || updates.rotation)
    );

    let parts = state.parts.map((part) => {
      if (part.id !== id) return part;

      return {
        ...part,
        ...updates,
        attachment: detachingAttachment ? undefined : (updates.attachment ?? part.attachment),
      };
    });

    const updatedPart = parts.find((part) => part.id === id);
    if (updatedPart?.hardwareKind === 'hinge') {
      parts = updateAttachedPartsForHinge(parts, id);
    }

    return { parts };
  }),

  removePart: (id) => set((state) => {
    const removedPart = state.parts.find((part) => part.id === id);
    const removingHinge = removedPart?.hardwareKind === 'hinge';

    const kept = state.parts.filter((part) => part.id !== id);
    const parts = removingHinge
      ? kept.map((part) =>
          part.attachment?.hingeId === id
            ? { ...part, attachment: undefined }
            : part
        )
      : kept;

    return {
      parts,
      selectedId: state.selectedId === id ? null : state.selectedId,
      hoveredId: state.hoveredId === id ? null : state.hoveredId,
    };
  }),

  selectPart: (id) => set({ selectedId: id }),

  setHoveredId: (id) => set({ hoveredId: id }),

  duplicatePart: (id, options) => set((state) => {
    const partToDuplicate = state.parts.find((p) => p.id === id);
    if (!partToDuplicate) return {};

    const shouldSelectDuplicate = options?.selectDuplicate ?? true;
    const newPart: PartData = {
      ...partToDuplicate,
      id: uuidv4(),
      position: [
        partToDuplicate.position[0] + 5, 
        partToDuplicate.position[1], 
        partToDuplicate.position[2] + 5
      ],
      attachment: undefined,
      hinge: partToDuplicate.hardwareKind === 'hinge'
        ? {
            ...(partToDuplicate.hinge ?? {
              angle: 0,
              minAngle: DEFAULT_HINGE_MIN_ANGLE,
              maxAngle: DEFAULT_HINGE_MAX_ANGLE,
              pinOffset: Math.max(partToDuplicate.dimensions[0] * 0.35, 0.2),
            }),
            angle: 0,
          }
        : partToDuplicate.hinge,
    };

    return {
      parts: [...state.parts, newPart],
      selectedId: shouldSelectDuplicate ? newPart.id : state.selectedId,
    };
  }),

  attachPartToHinge: (partId, hingeId) => set((state) => {
    if (partId === hingeId) return {};

    const part = state.parts.find((item) => item.id === partId);
    const hinge = state.parts.find((item) => item.id === hingeId);
    if (!part || !hinge || hinge.hardwareKind !== 'hinge') return {};
    if (part.hardwareKind === 'hinge') return {};

    const hingePivotPos = getHingePivotWorldPosition(hinge);
    const hingeWorldQuat = getHingeWorldQuaternion(hinge);
    const hingeInverseQuat = hingeWorldQuat.clone().invert();

    const localPos = new THREE.Vector3(...part.position)
      .sub(hingePivotPos)
      .applyQuaternion(hingeInverseQuat);

    const localRotQuat = hingeInverseQuat.clone().multiply(toQuaternion(part.rotation));
    const [localRx, localRy, localRz] = toEulerTuple(localRotQuat);

    return {
      parts: state.parts.map((item) =>
        item.id === partId
          ? {
              ...item,
              attachment: {
                hingeId,
                localPosition: [localPos.x, localPos.y, localPos.z],
                localRotation: [localRx, localRy, localRz],
              },
            }
          : item
      ),
    };
  }),

  detachPartFromHinge: (partId) => set((state) => ({
    parts: state.parts.map((part) =>
      part.id === partId
        ? { ...part, attachment: undefined }
        : part
    ),
  })),

  setHingeAngle: (hingeId, angle) => set((state) => {
    const hinge = state.parts.find((part) => part.id === hingeId);
    if (!hinge || hinge.hardwareKind !== 'hinge') return {};

    const [minAngle, maxAngle] = getHingeLimits(hinge);
    const clampedAngle = Math.max(minAngle, Math.min(maxAngle, angle));

    let parts = state.parts.map((part) =>
      part.id === hingeId
        ? {
            ...part,
            hinge: {
              angle: clampedAngle,
              minAngle,
              maxAngle,
              pinOffset: part.hinge?.pinOffset ?? getHingePinOffset(part),
            },
          }
        : part
    );

    parts = updateAttachedPartsForHinge(parts, hingeId);
    return { parts };
  }),

  autoScrewParts: (firstId, secondId) => {
    let result: AutoScrewResult = {
      ok: false,
      message: 'Could not place screws for that pair.',
      screwCount: 0,
    };

    set((state) => {
      if (firstId === secondId) {
        result = {
          ok: false,
          message: 'Select two different pieces.',
          screwCount: 0,
        };
        return {};
      }

      const first = state.parts.find((part) => part.id === firstId);
      const second = state.parts.find((part) => part.id === secondId);
      if (!first || !second) {
        result = {
          ok: false,
          message: 'Could not find both selected pieces.',
          screwCount: 0,
        };
        return {};
      }

      if (first.type === 'hardware' || second.type === 'hardware') {
        result = {
          ok: false,
          message: 'Auto screw only works with wood/sheet pieces.',
          screwCount: 0,
        };
        return {};
      }

      const firstFrame = buildOrientedFrame(first);
      const secondFrame = buildOrientedFrame(second);
      const centerDelta = secondFrame.center.clone().sub(firstFrame.center);
      const centerDeltaLength = centerDelta.length();
      const centerDeltaDir = centerDeltaLength > 0.0001
        ? centerDelta.clone().normalize()
        : null;
      const directionCandidates = getDirectionCandidates(firstFrame, secondFrame, centerDelta);

      if (directionCandidates.length === 0) {
        result = {
          ok: false,
          message: 'Could not find a valid screw direction for those pieces.',
          screwCount: 0,
        };
        return {};
      }

      let bestPlan:
        | {
            score: number;
            screws: PartData[];
          }
        | null = null;
      let foundTouchingDirection = false;
      let foundSharedProjection = false;

      for (const dir of directionCandidates) {
        const dirAlignment = centerDeltaDir ? Math.abs(dir.dot(centerDeltaDir)) : 1;
        if (dirAlignment < AUTO_SCREW_MIN_DIR_ALIGNMENT) {
          continue;
        }

        const alongFirst = getProjectedRange(firstFrame, dir);
        const alongSecond = getProjectedRange(secondFrame, dir);
        const alongGap = getIntervalGap(
          { start: alongFirst.min, end: alongFirst.max },
          { start: alongSecond.min, end: alongSecond.max }
        );
        const alongOverlap = getIntervalOverlap(
          alongFirst.min,
          alongFirst.max,
          alongSecond.min,
          alongSecond.max
        );
        if (alongGap > AUTO_SCREW_CONTACT_GAP_TOLERANCE) {
          continue;
        }
        if (alongOverlap > AUTO_SCREW_MAX_AXIS_OVERLAP) {
          continue;
        }
        foundTouchingDirection = true;

        const basisCandidates = getBasisCandidatesForDirection(dir);
        for (const basis of basisCandidates) {
          const uFirst = getProjectedRange(firstFrame, basis.u);
          const uSecond = getProjectedRange(secondFrame, basis.u);
          const vFirst = getProjectedRange(firstFrame, basis.v);
          const vSecond = getProjectedRange(secondFrame, basis.v);

          const overlapUMin = Math.max(uFirst.min, uSecond.min);
          const overlapUMax = Math.min(uFirst.max, uSecond.max);
          const overlapVMin = Math.max(vFirst.min, vSecond.min);
          const overlapVMax = Math.min(vFirst.max, vSecond.max);
          const overlapU = overlapUMax - overlapUMin;
          const overlapV = overlapVMax - overlapVMin;

          if (overlapU < AUTO_SCREW_OVERLAP_MIN || overlapV < AUTO_SCREW_OVERLAP_MIN) {
            continue;
          }
          foundSharedProjection = true;

          const uSamples = getSampleCoords(overlapUMin, overlapUMax);
          const vSamples = getSampleCoords(overlapVMin, overlapVMax);
          const minOverlap = Math.min(overlapU, overlapV);
          const minEdgeClearance = Math.max(0.08, Math.min(0.32, minOverlap * 0.2));

          const possiblePlacements: Array<{
            center: THREE.Vector3;
            preset: ScrewPreset;
            score: number;
            u: number;
            v: number;
            edgeMargin: number;
          }> = [];

          for (const uVal of uSamples) {
            for (const vVal of vSamples) {
              const linePoint = new THREE.Vector3()
                .addScaledVector(basis.u, uVal)
                .addScaledVector(basis.v, vVal);

              const firstLine = intersectLineWithFrame(firstFrame, linePoint, basis.dir, 0.01);
              const secondLine = intersectLineWithFrame(secondFrame, linePoint, basis.dir, 0.01);
              if (!firstLine || !secondLine) {
                continue;
              }
              if (firstLine.length < AUTO_SCREW_MIN_PENETRATION || secondLine.length < AUTO_SCREW_MIN_PENETRATION) {
                continue;
              }

              const lineGap = getIntervalGap(firstLine, secondLine);
              if (lineGap > AUTO_SCREW_CONTACT_GAP_TOLERANCE) {
                continue;
              }

              const chosenSegment = chooseScrewSegment(firstLine, secondLine);
              if (!chosenSegment) {
                continue;
              }

              const screwCenter = linePoint.clone().addScaledVector(basis.dir, chosenSegment.center);
              const edgeMargin = Math.min(
                uVal - uFirst.min,
                uFirst.max - uVal,
                vVal - vFirst.min,
                vFirst.max - vVal,
                uVal - uSecond.min,
                uSecond.max - uVal,
                vVal - vSecond.min,
                vSecond.max - vVal
              );
              if (edgeMargin < minEdgeClearance) {
                continue;
              }
              const centerBias =
                Math.abs(uVal - (overlapUMin + overlapUMax) / 2)
                + Math.abs(vVal - (overlapVMin + overlapVMax) / 2);
              const edgeBonus = Math.max(0, Math.min(0.4, edgeMargin - minEdgeClearance));

              possiblePlacements.push({
                center: screwCenter,
                preset: chosenSegment.preset,
                u: uVal,
                v: vVal,
                edgeMargin,
                score: chosenSegment.overlapFirst + chosenSegment.overlapSecond - lineGap * 1.75 - centerBias * 0.06 + edgeBonus * 0.8,
              });
            }
          }

          if (possiblePlacements.length < AUTO_SCREW_REQUIRED_COUNT) {
            continue;
          }

          const maxOverlap = Math.max(overlapU, overlapV);
          const tightSpace = minOverlap < 1.6 || maxOverlap < 2.25;
          const targetSpacing = tightSpace
            ? Math.max(0.16, Math.min(0.8, maxOverlap * 0.26))
            : Math.max(0.3, Math.min(1.4, maxOverlap * 0.35));
          let bestPair:
            | {
                first: typeof possiblePlacements[number];
                second: typeof possiblePlacements[number];
                pairScore: number;
              }
            | null = null;

          for (let i = 0; i < possiblePlacements.length; i += 1) {
            for (let j = i + 1; j < possiblePlacements.length; j += 1) {
              const p1 = possiblePlacements[i];
              const p2 = possiblePlacements[j];
              const du = Math.abs(p1.u - p2.u);
              const dv = Math.abs(p1.v - p2.v);
              const majorDelta = Math.max(du, dv);
              const minorDelta = Math.min(du, dv);
              if (majorDelta < targetSpacing) {
                continue;
              }

              const orientationBonus = tightSpace
                ? (majorDelta - minorDelta) * 0.3 - minorDelta * 0.08
                : minorDelta * 0.12;
              const edgePairBonus = Math.min(p1.edgeMargin, p2.edgeMargin) * 0.12;
              const directionBonus = dirAlignment * 0.6 - alongOverlap * 0.4;
              const pairScore = p1.score + p2.score + majorDelta * 0.32 + orientationBonus + edgePairBonus + directionBonus;
              if (!bestPair || pairScore > bestPair.pairScore) {
                bestPair = { first: p1, second: p2, pairScore };
              }
            }
          }

          if (!bestPair) {
            continue;
          }

          const screwRotation = toEulerTuple(
            new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), basis.dir)
          );
          const planScrews: PartData[] = [bestPair.first, bestPair.second].map((placement) => ({
            id: uuidv4(),
            name: placement.preset.name,
            type: 'hardware',
            hardwareKind: 'fastener',
            dimensions: [placement.preset.diameter, placement.preset.length, placement.preset.diameter],
            position: [placement.center.x, placement.center.y, placement.center.z],
            rotation: screwRotation,
            color: '#9ca3af',
          }));

          if (!bestPlan || bestPair.pairScore > bestPlan.score) {
            bestPlan = {
              score: bestPair.pairScore,
              screws: planScrews,
            };
          }
        }
      }

      if (!bestPlan) {
        if (!foundTouchingDirection) {
          result = {
            ok: false,
            message: 'Selected pieces need to be touching (or very close).',
            screwCount: 0,
          };
          return {};
        }

        if (!foundSharedProjection) {
          result = {
            ok: false,
            message: 'Could not find a shared region to place connecting screws.',
            screwCount: 0,
          };
          return {};
        }

        result = {
          ok: false,
          message: 'Could not place 2 screws that intersect both selected pieces.',
          screwCount: 0,
        };
        return {};
      }

      result = {
        ok: true,
        message: 'Placed 2 screws.',
        screwCount: 2,
      };
      return {
        parts: [...state.parts, ...bestPlan.screws],
        selectedId: secondId,
      };
    });

    return result;
  },

  setTool: (tool) => set({ tool }),

  resetScene: () => set({
    parts: [],
    selectedId: null,
    hoveredId: null,
    explodeFactor: 0,
    cameraFocusRequest: 0,
  }),

  setParts: (parts) => set({
    parts: rebuildAllAttachments(parts),
    selectedId: null,
    hoveredId: null,
  }),

  toggleSnap: () => set((state) => ({ snapEnabled: !state.snapEnabled })),

  toggleFloor: () => set((state) => ({ floorEnabled: !state.floorEnabled })),

  requestCameraFocus: () => set((state) => ({ cameraFocusRequest: state.cameraFocusRequest + 1 })),

  setExplodeFactor: (value) => set({ explodeFactor: Math.max(0, Math.min(1, value)) }),
}));
