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
