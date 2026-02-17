import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import * as THREE from 'three';
import { CutCorner, PartData, ToolType } from './types';

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

const clonePart = (part: PartData): PartData => ({
  ...part,
  dimensions: [...part.dimensions] as [number, number, number],
  position: [...part.position] as [number, number, number],
  rotation: [...part.rotation] as [number, number, number],
  profile: part.profile
    ? {
        ...part.profile,
        points: part.profile.points ? part.profile.points.map(([x, z]) => [x, z] as [number, number]) : undefined,
      }
    : undefined,
  hinge: part.hinge ? { ...part.hinge } : undefined,
  attachment: part.attachment
    ? {
        ...part.attachment,
        localPosition: [...part.attachment.localPosition] as [number, number, number],
        localRotation: [...part.attachment.localRotation] as [number, number, number],
      }
    : undefined,
});

const cloneParts = (parts: PartData[]) => parts.map(clonePart);

const withHistory = (
  state: AppState,
  nextParts: PartData[],
  extras: Partial<AppState> = {}
): Partial<AppState> => ({
  ...extras,
  parts: nextParts,
  pastParts: [...state.pastParts, cloneParts(state.parts)].slice(-80),
  futureParts: [],
});

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

const AUTO_SCREW_CONTACT_GAP_TOLERANCE = 0.6;
const AUTO_SCREW_OVERLAP_MIN = 0.08;
const AUTO_SCREW_MIN_PENETRATION = 0.12;
const AUTO_SCREW_REQUIRED_COUNT = 2;
const AUTO_SCREW_MIN_DIR_ALIGNMENT = 0.02;
const AUTO_SCREW_MAX_AXIS_OVERLAP = 999;
const AUTO_SCREW_PROFILE_EPS = 0.01;
const AUTO_SCREW_HEAD_PROTRUSION = 0.06;
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

const clampCut = (value: number, maxValue: number) => {
  const minValue = Math.min(0.125, maxValue / 2);
  const maxCut = Math.max(minValue, maxValue - minValue);
  return Math.max(minValue, Math.min(value, maxCut));
};

const getLCutFootprintPoints = (
  width: number,
  depth: number,
  cutWidth: number,
  cutDepth: number,
  corner: CutCorner
): [number, number][] => {
  const minX = -width / 2;
  const maxX = width / 2;
  const minZ = -depth / 2;
  const maxZ = depth / 2;

  if (corner === 'front-left') {
    return [
      [minX, minZ],
      [maxX, minZ],
      [maxX, maxZ],
      [minX + cutWidth, maxZ],
      [minX + cutWidth, maxZ - cutDepth],
      [minX, maxZ - cutDepth],
    ];
  }
  if (corner === 'front-right') {
    return [
      [minX, minZ],
      [maxX, minZ],
      [maxX, maxZ - cutDepth],
      [maxX - cutWidth, maxZ - cutDepth],
      [maxX - cutWidth, maxZ],
      [minX, maxZ],
    ];
  }
  if (corner === 'back-left') {
    return [
      [minX, minZ + cutDepth],
      [minX + cutWidth, minZ + cutDepth],
      [minX + cutWidth, minZ],
      [maxX, minZ],
      [maxX, maxZ],
      [minX, maxZ],
    ];
  }
  return [
    [minX, minZ],
    [maxX - cutWidth, minZ],
    [maxX - cutWidth, minZ + cutDepth],
    [maxX, minZ + cutDepth],
    [maxX, maxZ],
    [minX, maxZ],
  ];
};

const getPartFootprintPoints = (part: PartData): [number, number][] => {
  const width = part.dimensions[0];
  const depth = part.dimensions[2];
  if (part.profile?.type === 'polygon' && part.profile.points && part.profile.points.length >= 3) {
    return part.profile.points;
  }
  if (part.profile?.type === 'l-cut') {
    const cutWidth = clampCut(part.profile.cutWidth ?? width / 2, width);
    const cutDepth = clampCut(part.profile.cutDepth ?? depth / 2, depth);
    const corner = part.profile.corner ?? 'front-left';
    return getLCutFootprintPoints(width, depth, cutWidth, cutDepth, corner);
  }
  return [
    [-width / 2, -depth / 2],
    [width / 2, -depth / 2],
    [width / 2, depth / 2],
    [-width / 2, depth / 2],
  ];
};

const isPointOnSegment2d = (
  point: [number, number],
  start: [number, number],
  end: [number, number]
) => {
  const [px, pz] = point;
  const [x1, z1] = start;
  const [x2, z2] = end;
  const cross = (px - x1) * (z2 - z1) - (pz - z1) * (x2 - x1);
  if (Math.abs(cross) > AUTO_SCREW_PROFILE_EPS) {
    return false;
  }
  const dot = (px - x1) * (px - x2) + (pz - z1) * (pz - z2);
  return dot <= AUTO_SCREW_PROFILE_EPS;
};

const pointInPolygonOrOnEdge2d = (x: number, z: number, points: [number, number][]) => {
  let inside = false;
  const testPoint: [number, number] = [x, z];
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i];
    const b = points[j];
    if (isPointOnSegment2d(testPoint, a, b)) {
      return true;
    }

    const xi = a[0];
    const zi = a[1];
    const xj = b[0];
    const zj = b[1];
    const intersects = ((zi > z) !== (zj > z))
      && (x < ((xj - xi) * (z - zi)) / ((zj - zi) || Number.EPSILON) + xi);
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
};

const estimateScrewPenetrationLength = (
  frame: OrientedFrame,
  footprint: [number, number][],
  screwCenter: THREE.Vector3,
  screwDir: THREE.Vector3,
  screwLength: number
) => {
  const sampleCount = 31;
  let insideCount = 0;
  const dir = screwDir.clone().normalize();

  for (let i = 0; i < sampleCount; i += 1) {
    const t = -screwLength / 2 + (i / (sampleCount - 1)) * screwLength;
    const worldPoint = screwCenter.clone().addScaledVector(dir, t);
    const [lx, ly, lz] = getLinePointCoordsInFrame(frame, worldPoint);
    const insideY = Math.abs(ly) <= frame.half[1] + AUTO_SCREW_PROFILE_EPS;
    if (!insideY) continue;
    if (pointInPolygonOrOnEdge2d(lx, lz, footprint)) {
      insideCount += 1;
    }
  }

  return (insideCount / (sampleCount - 1)) * screwLength;
};

const getRequiredScrewPenetration = (screwLength: number) =>
  Math.max(AUTO_SCREW_MIN_PENETRATION, Math.min(0.45, screwLength * 0.18));

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
  const firstNearFace = firstLine.end;
  const secondNearFace = secondLine.start;
  const seamCenter = (firstNearFace + secondNearFace) / 2;
  const gap = Math.abs(secondNearFace - firstNearFace);
  const headProtrusion = AUTO_SCREW_HEAD_PROTRUSION;
  const tipInset = 0.05;

  // Directional behavior:
  // first piece = entry side (head side), second piece = destination side.
  const entryStart = firstLine.start - headProtrusion;
  const maxEndInsideSecond = secondLine.end - tipInset;

  if (maxEndInsideSecond - entryStart < AUTO_SCREW_MIN_PENETRATION * 2) {
    return null;
  }

  let best:
    | {
        center: number;
        seamCenter: number;
        preset: ScrewPreset;
        overlapFirst: number;
        overlapSecond: number;
        score: number;
      }
    | null = null;

  for (const preset of AUTO_SCREW_PRESETS) {
    const requiredPenetration = getRequiredScrewPenetration(preset.length);
    const segmentStart = entryStart;
    const segmentEnd = segmentStart + preset.length;

    // Never allow the screw to exit the far side of the destination piece.
    if (segmentEnd > maxEndInsideSecond + 1e-6) {
      continue;
    }

    const overlapFirst = getIntervalOverlap(segmentStart, segmentEnd, firstLine.start, firstLine.end);
    const overlapSecond = getIntervalOverlap(segmentStart, segmentEnd, secondLine.start, secondLine.end);
    if (overlapFirst < requiredPenetration || overlapSecond < requiredPenetration) {
      continue;
    }

    // Must cross from first into second around the seam.
    if (!(segmentStart <= seamCenter + AUTO_SCREW_CONTACT_GAP_TOLERANCE && segmentEnd >= seamCenter - AUTO_SCREW_CONTACT_GAP_TOLERANCE)) {
      continue;
    }

    const center = (segmentStart + segmentEnd) / 2;
    const secondThickness = Math.max(0.001, secondLine.end - secondLine.start);
    const targetSecondPenetration = Math.min(secondThickness - tipInset, Math.max(requiredPenetration, secondThickness * 0.72));
    const secondPenetrationBias = Math.abs(overlapSecond - targetSecondPenetration);

    const score =
      overlapFirst
      + overlapSecond * 1.35
      - gap * 0.45
      - secondPenetrationBias * 0.8
      - Math.abs(preset.length - 2.5) * 0.05
      - Math.abs(center - seamCenter) * 0.03;

    if (!best || score > best.score) {
      best = {
        center,
        seamCenter,
        preset,
        overlapFirst,
        overlapSecond,
        score,
      };
    }
  }

  return best;
};

const getSampleCoords = (min: number, max: number) => {
  const span = max - min;
  const center = (min + max) / 2;
  const values = [center];

  if (span >= 0.32) {
    values.push(min + span * 0.25, max - span * 0.25);
  }
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
    if (axis.lengthSq() < 1e-8) return;
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
  pastParts: PartData[][];
  futureParts: PartData[][];
  selectedId: string | null;
  hoveredId: string | null;
  tool: ToolType;
  explodeFactor: number;
  cameraFocusRequest: number;
  
  addPart: (part: PartData) => void;
  updatePart: (
    id: string,
    updates: Partial<PartData>,
    options?: { trackHistory?: boolean }
  ) => void;
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
  edgeSnapEnabled: boolean;
  toggleEdgeSnap: () => void;
  undo: () => void;
  redo: () => void;
  floorEnabled: boolean;
  toggleFloor: () => void;
  shadowsEnabled: boolean;
  toggleShadows: () => void;
  requestCameraFocus: () => void;
  setExplodeFactor: (value: number) => void;
}

export const useStore = create<AppState>((set) => ({
  parts: [],
  pastParts: [],
  futureParts: [],
  selectedId: null,
  hoveredId: null,
  tool: 'select',
  explodeFactor: 0,
  cameraFocusRequest: 0,
  snapEnabled: true, // Default to true for easier alignment
  edgeSnapEnabled: true,
  floorEnabled: false,
  shadowsEnabled: false,

  addPart: (part) => set((state) =>
    withHistory(state, [...state.parts, part], {
      selectedId: part.id,
    })
  ),

  updatePart: (id, updates, options) => set((state) => {
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

    if (options?.trackHistory === false) {
      return { parts };
    }

    return withHistory(state, parts);
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

    return withHistory(state, parts, {
      selectedId: state.selectedId === id ? null : state.selectedId,
      hoveredId: state.hoveredId === id ? null : state.hoveredId,
    });
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
      position: [...partToDuplicate.position] as [number, number, number],
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

    return withHistory(state, [...state.parts, newPart], {
      selectedId: shouldSelectDuplicate ? newPart.id : state.selectedId,
    });
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

    const nextParts = state.parts.map((item) =>
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
    );
    return withHistory(state, nextParts);
  }),

  detachPartFromHinge: (partId) => set((state) => {
    const nextParts = state.parts.map((part) =>
      part.id === partId
        ? { ...part, attachment: undefined }
        : part
    );
    return withHistory(state, nextParts);
  }),

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
    return withHistory(state, parts);
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
      const firstFootprint = getPartFootprintPoints(first);
      const secondFootprint = getPartFootprintPoints(second);
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
        const dirAlignment = centerDeltaDir ? dir.dot(centerDeltaDir) : 1;
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
              const requiredPenetration = getRequiredScrewPenetration(chosenSegment.preset.length);
              const penetrationFirst = estimateScrewPenetrationLength(
                firstFrame,
                firstFootprint,
                screwCenter,
                basis.dir,
                chosenSegment.preset.length
              );
              const penetrationSecond = estimateScrewPenetrationLength(
                secondFrame,
                secondFootprint,
                screwCenter,
                basis.dir,
                chosenSegment.preset.length
              );
              if (
                penetrationFirst < requiredPenetration
                || penetrationSecond < requiredPenetration
              ) {
                continue;
              }
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
              const seamOffset = Math.abs(chosenSegment.center - chosenSegment.seamCenter);

              possiblePlacements.push({
                center: screwCenter,
                preset: chosenSegment.preset,
                u: uVal,
                v: vVal,
                edgeMargin,
                score:
                  chosenSegment.overlapFirst
                  + chosenSegment.overlapSecond
                  + penetrationFirst
                  + penetrationSecond
                  - lineGap * 1.75
                  - seamOffset * 0.2
                  - centerBias * 0.06
                  + edgeBonus * 0.8,
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
            const preferredAxisBias = Math.max(
              ...firstFrame.axes.map((axis) => Math.abs(axis.dot(basis.dir)))
            );
            bestPlan = {
              score: bestPair.pairScore + preferredAxisBias * 0.3,
              screws: planScrews,
            };
          }
        }
      }

      if (!bestPlan) {
        if (!foundTouchingDirection) {
          result = {
            ok: false,
            message: 'Selected pieces need to overlap/touch (or be very close).',
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

      const screwsActuallyConnect = bestPlan.screws.every((screw) => {
        const screwCenter = new THREE.Vector3(...screw.position);
        const screwDir = new THREE.Vector3(0, 1, 0)
          .applyQuaternion(toQuaternion(screw.rotation))
          .normalize();
        const screwLength = screw.dimensions[1];
        const requiredPenetration = getRequiredScrewPenetration(screwLength);

        const firstLine = intersectLineWithFrame(firstFrame, screwCenter, screwDir, 0.002);
        const secondLine = intersectLineWithFrame(secondFrame, screwCenter, screwDir, 0.002);
        if (!firstLine || !secondLine) {
          return false;
        }
        const segStart = -screwLength / 2;
        const segEnd = screwLength / 2;
        const overlapFirstLine = getIntervalOverlap(segStart, segEnd, firstLine.start, firstLine.end);
        const overlapSecondLine = getIntervalOverlap(segStart, segEnd, secondLine.start, secondLine.end);
        if (overlapFirstLine < requiredPenetration || overlapSecondLine < requiredPenetration) {
          return false;
        }

        const penetrationFirst = estimateScrewPenetrationLength(
          firstFrame,
          firstFootprint,
          screwCenter,
          screwDir,
          screwLength
        );
        const penetrationSecond = estimateScrewPenetrationLength(
          secondFrame,
          secondFootprint,
          screwCenter,
          screwDir,
          screwLength
        );
        return (
          penetrationFirst >= requiredPenetration
          && penetrationSecond >= requiredPenetration
        );
      });

      if (!screwsActuallyConnect) {
        result = {
          ok: false,
          message: 'Could not place screws that cleanly intersect both selected pieces.',
          screwCount: 0,
        };
        return {};
      }

      result = {
        ok: true,
        message: 'Placed 2 screws.',
        screwCount: 2,
      };
      return withHistory(state, [...state.parts, ...bestPlan.screws], {
        selectedId: secondId,
      });
    });

    return result;
  },

  setTool: (tool) => set({ tool }),

  resetScene: () => set((state) =>
    withHistory(state, [], {
      selectedId: null,
      hoveredId: null,
      explodeFactor: 0,
      cameraFocusRequest: 0,
    })
  ),

  setParts: (parts) => set((state) =>
    withHistory(state, rebuildAllAttachments(parts), {
      selectedId: null,
      hoveredId: null,
    })
  ),

  toggleSnap: () => set((state) => ({ snapEnabled: !state.snapEnabled })),

  toggleEdgeSnap: () => set((state) => ({ edgeSnapEnabled: !state.edgeSnapEnabled })),

  undo: () => set((state) => {
    if (state.pastParts.length === 0) return {};
    const previous = state.pastParts[state.pastParts.length - 1];
    return {
      parts: rebuildAllAttachments(cloneParts(previous)),
      pastParts: state.pastParts.slice(0, -1),
      futureParts: [cloneParts(state.parts), ...state.futureParts].slice(0, 80),
      selectedId: null,
      hoveredId: null,
    };
  }),

  redo: () => set((state) => {
    if (state.futureParts.length === 0) return {};
    const [next, ...remainingFuture] = state.futureParts;
    return {
      parts: rebuildAllAttachments(cloneParts(next)),
      pastParts: [...state.pastParts, cloneParts(state.parts)].slice(-80),
      futureParts: remainingFuture,
      selectedId: null,
      hoveredId: null,
    };
  }),

  toggleFloor: () => set((state) => ({ floorEnabled: !state.floorEnabled })),

  toggleShadows: () => set((state) => ({ shadowsEnabled: !state.shadowsEnabled })),

  requestCameraFocus: () => set((state) => ({ cameraFocusRequest: state.cameraFocusRequest + 1 })),

  setExplodeFactor: (value) => set({ explodeFactor: Math.max(0, Math.min(1, value)) }),
}));
