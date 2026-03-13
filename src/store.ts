import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import * as THREE from 'three';
import { CutCorner, PartData, SawFaceState, SawPlane, ToolType } from './types';
import type { StressScenario } from './structuralAnalysis';

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
const AUTO_SCREW_DEFAULT_COUNT = 2;
const AUTO_SCREW_MIN_COUNT = 1;
const AUTO_SCREW_MAX_COUNT = 4;
const AUTO_SCREW_MIN_DIR_ALIGNMENT = 0.02;
// Keep screw axis close to the actual "through-joint" direction.
// Large overlap along the screw axis usually means the screw is running
// parallel to the contact plane, which is not a valid join.
const AUTO_SCREW_MAX_AXIS_OVERLAP = 0.75;
const AUTO_SCREW_MAX_AXIS_OVERLAP_RATIO = 0.6;
const AUTO_SCREW_PROFILE_EPS = 0.01;
const AUTO_SCREW_HEAD_PROTRUSION = 0.06;
const AUTO_SCREW_PRESETS: ScrewPreset[] = [
  { name: '#8 x 1-1/4" Wood Screw', length: 1.25, diameter: 0.164 },
  { name: '#10 x 2-1/2" Wood Screw', length: 2.5, diameter: 0.19 },
  { name: '#12 x 3" Wood Screw', length: 3, diameter: 0.216 },
];

type AutoScrewPlacementCandidate = {
  center: THREE.Vector3;
  preset: ScrewPreset;
  score: number;
  u: number;
  v: number;
  edgeMargin: number;
  firstContainment: ScrewContainmentSummary;
  secondContainment: ScrewContainmentSummary;
};

type ScrewContainmentSummary = {
  minMargin: number;
  averageMargin: number;
  seamMargin: number;
  farMargin: number;
};

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

const getPointToSegmentDistance2d = (
  point: [number, number],
  start: [number, number],
  end: [number, number]
) => {
  const [px, pz] = point;
  const [x1, z1] = start;
  const [x2, z2] = end;
  const dx = x2 - x1;
  const dz = z2 - z1;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq <= Number.EPSILON) {
    return Math.hypot(px - x1, pz - z1);
  }

  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / lengthSq));
  const closestX = x1 + dx * t;
  const closestZ = z1 + dz * t;
  return Math.hypot(px - closestX, pz - closestZ);
};

const getPolygonEdgeDistance2d = (x: number, z: number, points: [number, number][]) => {
  if (points.length === 0) return 0;
  const point: [number, number] = [x, z];
  let best = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const start = points[i];
    const end = points[(i + 1) % points.length];
    best = Math.min(best, getPointToSegmentDistance2d(point, start, end));
  }
  return Number.isFinite(best) ? best : 0;
};

const SAW_PATH_EPS = 0.02;

const pointsClose2d = (a: [number, number], b: [number, number], epsilon = SAW_PATH_EPS) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]) <= epsilon;

const signedPolygonArea2d = (points: [number, number][]) => {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, z1] = points[i];
    const [x2, z2] = points[(i + 1) % points.length];
    area += x1 * z2 - x2 * z1;
  }
  return area / 2;
};

const simplifyPolygon2d = (points: [number, number][], epsilon = SAW_PATH_EPS) => {
  if (points.length < 3) return points;

  const deduped = points.filter((point, index) => {
    const prev = points[(index - 1 + points.length) % points.length];
    return !pointsClose2d(point, prev, epsilon);
  });

  if (deduped.length < 3) return deduped;

  return deduped.filter((point, index) => {
    const prev = deduped[(index - 1 + deduped.length) % deduped.length];
    const next = deduped[(index + 1) % deduped.length];
    const v1x = point[0] - prev[0];
    const v1z = point[1] - prev[1];
    const v2x = next[0] - point[0];
    const v2z = next[1] - point[1];
    const cross = v1x * v2z - v1z * v2x;
    return Math.abs(cross) > epsilon;
  });
};

const normalizePolygon2d = (points: [number, number][]) => {
  const simplified = simplifyPolygon2d(points);
  if (simplified.length < 3) return simplified;
  return signedPolygonArea2d(simplified) < 0 ? [...simplified].reverse() : simplified;
};

const insertPointOnPolygonBoundary = (
  polygon: [number, number][],
  point: [number, number],
  epsilon = SAW_PATH_EPS
) => {
  const existingIndex = polygon.findIndex((candidate) => pointsClose2d(candidate, point, epsilon));
  if (existingIndex >= 0) {
    const next = [...polygon];
    next[existingIndex] = point;
    return { points: next, index: existingIndex };
  }

  for (let i = 0; i < polygon.length; i += 1) {
    const nextIndex = (i + 1) % polygon.length;
    if (isPointOnSegment2d(point, polygon[i], polygon[nextIndex])) {
      const next = [...polygon];
      next.splice(nextIndex, 0, point);
      return { points: next, index: nextIndex };
    }
  }

  return null;
};

const collectBoundaryChain = (polygon: [number, number][], startIndex: number, endIndex: number) => {
  const chain: [number, number][] = [polygon[startIndex]];
  let index = startIndex;
  while (index !== endIndex) {
    index = (index + 1) % polygon.length;
    chain.push(polygon[index]);
    if (chain.length > polygon.length + 2) break;
  }
  return chain;
};

const isSawPathValid = (polygon: [number, number][], path: [number, number][]) => {
  if (path.length < 2) return false;
  for (let i = 0; i < path.length; i += 1) {
    const point = path[i];
    if (!pointInPolygonOrOnEdge2d(point[0], point[1], polygon)) {
      return false;
    }
    if (i > 0 && pointsClose2d(point, path[i - 1], SAW_PATH_EPS)) {
      return false;
    }
  }

  const start = path[0];
  const end = path[path.length - 1];
  const startOnBoundary = polygon.some((point, index) =>
    isPointOnSegment2d(start, point, polygon[(index + 1) % polygon.length])
  );
  const endOnBoundary = polygon.some((point, index) =>
    isPointOnSegment2d(end, point, polygon[(index + 1) % polygon.length])
  );

  if (!startOnBoundary || !endOnBoundary || pointsClose2d(start, end, SAW_PATH_EPS)) {
    return false;
  }

  for (let i = 1; i < path.length; i += 1) {
    const mid: [number, number] = [
      (path[i - 1][0] + path[i][0]) / 2,
      (path[i - 1][1] + path[i][1]) / 2,
    ];
    if (!pointInPolygonOrOnEdge2d(mid[0], mid[1], polygon)) {
      return false;
    }
  }

  return true;
};

const isSegmentOnPolygonBoundary = (
  polygon: [number, number][],
  start: [number, number],
  end: [number, number]
) => {
  if (!polygon.some((point, index) => isPointOnSegment2d(start, point, polygon[(index + 1) % polygon.length]))) {
    return false;
  }
  if (!polygon.some((point, index) => isPointOnSegment2d(end, point, polygon[(index + 1) % polygon.length]))) {
    return false;
  }

  const mid: [number, number] = [
    (start[0] + end[0]) / 2,
    (start[1] + end[1]) / 2,
  ];
  return polygon.some((point, index) => isPointOnSegment2d(mid, point, polygon[(index + 1) % polygon.length]));
};

const trimSawPathBoundaryRuns = (polygon: [number, number][], pathInput: [number, number][]) => {
  if (pathInput.length < 2) return pathInput;

  let startIndex = 0;
  while (
    startIndex < pathInput.length - 1
    && isSegmentOnPolygonBoundary(polygon, pathInput[startIndex], pathInput[startIndex + 1])
  ) {
    startIndex += 1;
  }

  let endIndex = pathInput.length - 1;
  while (
    endIndex > startIndex
    && isSegmentOnPolygonBoundary(polygon, pathInput[endIndex - 1], pathInput[endIndex])
  ) {
    endIndex -= 1;
  }

  return pathInput.slice(startIndex, endIndex + 1);
};

const splitPolygonWithSawPath = (polygonInput: [number, number][], pathInput: [number, number][]) => {
  const polygon = normalizePolygon2d(polygonInput);
  const path = trimSawPathBoundaryRuns(polygon, pathInput.slice());
  if (!isSawPathValid(polygon, path)) return null;

  const startInsert = insertPointOnPolygonBoundary(polygon, path[0]);
  if (!startInsert) return null;
  const endInsert = insertPointOnPolygonBoundary(startInsert.points, path[path.length - 1]);
  if (!endInsert) return null;
  const startIndex = endInsert.points.findIndex((point) => pointsClose2d(point, path[0]));
  const endIndex = endInsert.points.findIndex((point) => pointsClose2d(point, path[path.length - 1]));
  if (startIndex < 0 || endIndex < 0 || startIndex === endIndex) return null;

  const boundaryForward = collectBoundaryChain(endInsert.points, startIndex, endIndex);
  const boundaryBackward = collectBoundaryChain(endInsert.points, endIndex, startIndex);
  const reversedPath = [...path].reverse();

  const first = normalizePolygon2d([
    ...path,
    ...boundaryBackward.slice(1, -1),
  ]);
  const second = normalizePolygon2d([
    ...reversedPath,
    ...boundaryForward.slice(1, -1),
  ]);

  if (first.length < 3 || second.length < 3) return null;
  if (Math.abs(signedPolygonArea2d(first)) <= SAW_PATH_EPS || Math.abs(signedPolygonArea2d(second)) <= SAW_PATH_EPS) {
    return null;
  }

  return [first, second] as const;
};

const getSawPlanePolygon = (part: PartData, plane: SawPlane): [number, number][] => {
  if (plane === 'xz') {
    return getPartFootprintPoints(part);
  }

  if (plane === 'xy') {
    const [width, height] = part.dimensions;
    return [
      [-width / 2, -height / 2],
      [width / 2, -height / 2],
      [width / 2, height / 2],
      [-width / 2, height / 2],
    ];
  }

  const [, height, depth] = part.dimensions;
  return [
    [-depth / 2, -height / 2],
    [depth / 2, -height / 2],
    [depth / 2, height / 2],
    [-depth / 2, height / 2],
  ];
};

const createPartFromSawPolygon = (
  source: PartData,
  polygonInput: [number, number][],
  face: SawFaceState,
  name: string
): PartData | null => {
  const polygon = normalizePolygon2d(polygonInput);
  if (polygon.length < 3) return null;

  const frame = buildOrientedFrame(source);
  const mins = {
    u: Math.min(...polygon.map(([u]) => u)),
    v: Math.min(...polygon.map(([, v]) => v)),
  };
  const maxs = {
    u: Math.max(...polygon.map(([u]) => u)),
    v: Math.max(...polygon.map(([, v]) => v)),
  };
  const spanU = maxs.u - mins.u;
  const spanV = maxs.v - mins.v;
  if (spanU <= SAW_PATH_EPS || spanV <= SAW_PATH_EPS) return null;

  const centerU = (mins.u + maxs.u) / 2;
  const centerV = (mins.v + maxs.v) / 2;

  let dimensions: [number, number, number];
  let worldCenter = frame.center.clone();
  let localProfilePoints: [number, number][];
  let basisX: THREE.Vector3;
  let basisY: THREE.Vector3;
  let basisZ: THREE.Vector3;

  if (face.plane === 'xz') {
    dimensions = [spanU, source.dimensions[1], spanV];
    worldCenter = worldCenter
      .add(frame.axes[0].clone().multiplyScalar(centerU))
      .add(frame.axes[2].clone().multiplyScalar(centerV));
    localProfilePoints = polygon.map(([u, v]) => [u - centerU, v - centerV] as [number, number]);
    basisX = frame.axes[0].clone();
    basisY = frame.axes[1].clone();
    basisZ = frame.axes[2].clone();
  } else if (face.plane === 'xy') {
    dimensions = [spanU, source.dimensions[2], spanV];
    worldCenter = worldCenter
      .add(frame.axes[0].clone().multiplyScalar(centerU))
      .add(frame.axes[1].clone().multiplyScalar(centerV));
    localProfilePoints = polygon.map(([u, v]) => [u - centerU, -(v - centerV)] as [number, number]);
    basisX = frame.axes[0].clone();
    basisY = frame.axes[2].clone().multiplyScalar(face.normalSign);
    basisZ = frame.axes[1].clone().multiplyScalar(-1);
  } else {
    dimensions = [spanU, source.dimensions[0], spanV];
    worldCenter = worldCenter
      .add(frame.axes[2].clone().multiplyScalar(centerU))
      .add(frame.axes[1].clone().multiplyScalar(centerV));
    localProfilePoints = polygon.map(([u, v]) => [u - centerU, v - centerV] as [number, number]);
    basisX = frame.axes[2].clone().multiplyScalar(face.normalSign);
    basisY = frame.axes[0].clone();
    basisZ = frame.axes[1].clone();
  }

  const rotationMatrix = new THREE.Matrix4().makeBasis(basisX, basisY, basisZ);
  const rotation = new THREE.Euler().setFromRotationMatrix(rotationMatrix, 'XYZ');

  return {
    ...source,
    id: uuidv4(),
    name,
    dimensions,
    position: [worldCenter.x, worldCenter.y, worldCenter.z],
    rotation: [rotation.x, rotation.y, rotation.z],
    profile: {
      type: 'polygon',
      points: localProfilePoints,
    },
    attachment: undefined,
  };
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

const getPointContainmentInFrame = (
  frame: OrientedFrame,
  footprint: [number, number][],
  worldPoint: THREE.Vector3
) => {
  const [lx, ly, lz] = getLinePointCoordsInFrame(frame, worldPoint);
  const thicknessMargin = frame.half[1] - Math.abs(ly);
  if (thicknessMargin < -AUTO_SCREW_PROFILE_EPS) {
    return null;
  }
  if (!pointInPolygonOrOnEdge2d(lx, lz, footprint)) {
    return null;
  }

  const profileMargin = getPolygonEdgeDistance2d(lx, lz, footprint);
  return {
    profileMargin,
    thicknessMargin,
    margin: Math.min(profileMargin, thicknessMargin),
  };
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

const summarizeSegmentContainment = (
  frame: OrientedFrame,
  footprint: [number, number][],
  screwCenter: THREE.Vector3,
  screwDir: THREE.Vector3,
  start: number,
  end: number,
  seamAtStart: boolean
): ScrewContainmentSummary | null => {
  if (end - start <= 1e-5) {
    return null;
  }

  const dir = screwDir.clone().normalize();
  const sampleCount = 7;
  let minMargin = Infinity;
  let totalMargin = 0;
  let seamMargin = Infinity;
  let farMargin = Infinity;

  for (let i = 0; i < sampleCount; i += 1) {
    // Sample interior points only. The screw is expected to touch the part
    // boundary at its entry/exit faces, so endpoint samples would incorrectly
    // report zero clearance for otherwise valid placements.
    const ratio = (i + 0.5) / sampleCount;
    const t = start + (end - start) * ratio;
    const worldPoint = screwCenter.clone().addScaledVector(dir, t);
    const containment = getPointContainmentInFrame(frame, footprint, worldPoint);
    if (!containment) {
      return null;
    }

    minMargin = Math.min(minMargin, containment.margin);
    totalMargin += containment.margin;

    if (ratio <= 0.34) {
      if (seamAtStart) seamMargin = Math.min(seamMargin, containment.margin);
      else farMargin = Math.min(farMargin, containment.margin);
    }
    if (ratio >= 0.66) {
      if (seamAtStart) farMargin = Math.min(farMargin, containment.margin);
      else seamMargin = Math.min(seamMargin, containment.margin);
    }
  }

  return {
    minMargin,
    averageMargin: totalMargin / sampleCount,
    seamMargin: Number.isFinite(seamMargin) ? seamMargin : minMargin,
    farMargin: Number.isFinite(farMargin) ? farMargin : minMargin,
  };
};

const isSegmentRadiallyContained = (
  frame: OrientedFrame,
  footprint: [number, number][],
  screwCenter: THREE.Vector3,
  screwDir: THREE.Vector3,
  basisU: THREE.Vector3,
  basisV: THREE.Vector3,
  start: number,
  end: number,
  radius: number
) => {
  if (end - start <= 1e-5) {
    return false;
  }

  const dir = screwDir.clone().normalize();
  const radialDirections = [
    basisU.clone(),
    basisU.clone().multiplyScalar(-1),
    basisV.clone(),
    basisV.clone().multiplyScalar(-1),
    basisU.clone().add(basisV).normalize(),
    basisU.clone().sub(basisV).normalize(),
    basisV.clone().sub(basisU).normalize(),
    basisU.clone().add(basisV).normalize().multiplyScalar(-1),
  ];
  const sampleCount = 5;

  for (let i = 0; i < sampleCount; i += 1) {
    const ratio = (i + 0.5) / sampleCount;
    const t = start + (end - start) * ratio;
    const basePoint = screwCenter.clone().addScaledVector(dir, t);
    for (const radialDir of radialDirections) {
      const testPoint = basePoint.clone().addScaledVector(radialDir, radius);
      if (!getPointContainmentInFrame(frame, footprint, testPoint)) {
        return false;
      }
    }
  }

  return true;
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
  const seamStart = firstLine.end;
  const seamEnd = secondLine.start;
  const seamCenter = (seamStart + seamEnd) / 2;
  const gap = Math.max(0, seamEnd - seamStart);
  const headProtrusion = AUTO_SCREW_HEAD_PROTRUSION;
  const tipInset = 0.05;

  // Directional behavior:
  // first piece = entry side (head side), second piece = destination side.
  const entryStart = firstLine.start - headProtrusion;
  const maxEndInsideSecond = secondLine.end - tipInset;
  const firstThickness = Math.max(0.001, firstLine.end - firstLine.start);
  const secondThickness = Math.max(0.001, secondLine.end - secondLine.start);

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
    const availableRun = maxEndInsideSecond - segmentStart;

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
    const preferredSecondPenetration = Math.min(
      secondThickness - tipInset,
      Math.max(requiredPenetration, secondThickness * 0.58)
    );
    const targetSecondPenetration = Math.min(
      secondThickness - tipInset,
      Math.max(preferredSecondPenetration, secondThickness * 0.72)
    );
    const desiredLength = headProtrusion + firstThickness + targetSecondPenetration + Math.max(0, gap);
    const secondPenetrationBias = Math.abs(overlapSecond - targetSecondPenetration);
    const lengthWaste = Math.max(0, preset.length - desiredLength);
    const underReachPenalty = Math.max(0, preferredSecondPenetration - overlapSecond);
    const firstEngagementBias = Math.abs(overlapFirst - Math.min(firstThickness, Math.max(requiredPenetration, firstThickness * 0.75)));

    const score =
      overlapSecond * 2.2
      + overlapFirst * 0.85
      - gap * 0.65
      - secondPenetrationBias * 1.9
      - underReachPenalty * 2.6
      - firstEngagementBias * 0.5
      - lengthWaste * 0.85
      - Math.abs(preset.length - availableRun) * 0.08
      - Math.abs(center - seamCenter) * 0.05;

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
  if (span <= AUTO_SCREW_OVERLAP_MIN) {
    return [];
  }

  const center = (min + max) / 2;
  const desiredPadding = Math.min(0.4, span * 0.22);
  const padding = Math.min(desiredPadding, Math.max(0.02, span * 0.12));
  let innerMin = min + padding;
  let innerMax = max - padding;
  if (innerMax - innerMin < 0.08) {
    innerMin = min + span * 0.08;
    innerMax = max - span * 0.08;
  }
  if (innerMax <= innerMin) {
    return [center];
  }

  const sampleCount = span >= 3.2 ? 6 : span >= 1.8 ? 5 : span >= 0.75 ? 4 : 3;
  const values: number[] = [];
  for (let i = 0; i < sampleCount; i += 1) {
    const ratio = sampleCount === 1 ? 0.5 : i / (sampleCount - 1);
    values.push(innerMin + (innerMax - innerMin) * ratio);
  }
  values.push(center);

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

const clampAutoScrewCount = (value: number) => {
  const finiteValue = Number.isFinite(value) ? value : AUTO_SCREW_DEFAULT_COUNT;
  const rounded = Math.round(finiteValue);
  return Math.max(AUTO_SCREW_MIN_COUNT, Math.min(AUTO_SCREW_MAX_COUNT, rounded));
};

const formatScrewCountLabel = (count: number) => (count === 1 ? '1 screw' : `${count} screws`);

const getPlacementSafetyScore = (placement: AutoScrewPlacementCandidate) => {
  const destinationCore = Math.min(
    placement.secondContainment.minMargin,
    placement.secondContainment.seamMargin
  );
  const entryCore = Math.min(
    placement.firstContainment.minMargin,
    placement.firstContainment.averageMargin
  );
  return (
    destinationCore * 2.8
    + placement.secondContainment.averageMargin * 2.1
    + placement.secondContainment.farMargin * 0.9
    + entryCore * 0.9
    + placement.edgeMargin * 0.75
  );
};

const chooseBestPlacementSet = (
  possiblePlacements: AutoScrewPlacementCandidate[],
  requestedCount: number,
  options: {
    targetSpacing: number;
    tightSpace: boolean;
    dirAlignment: number;
    alongOverlap: number;
  }
) => {
  if (possiblePlacements.length < requestedCount) {
    return null;
  }

  const directionBonus = options.dirAlignment * 0.8 - options.alongOverlap * 0.45;
  const getPlacementQuality = (placement: AutoScrewPlacementCandidate) =>
    placement.score + getPlacementSafetyScore(placement) * 1.3;
  const ranked = [...possiblePlacements].sort((a, b) => {
    const scoreA = getPlacementQuality(a);
    const scoreB = getPlacementQuality(b);
    return scoreB - scoreA;
  });
  const uValues = possiblePlacements.map((placement) => placement.u);
  const vValues = possiblePlacements.map((placement) => placement.v);
  const uRange = Math.max(...uValues) - Math.min(...uValues);
  const vRange = Math.max(...vValues) - Math.min(...vValues);
  const majorAxis: 'u' | 'v' = uRange >= vRange ? 'u' : 'v';
  const minorAxis: 'u' | 'v' = majorAxis === 'u' ? 'v' : 'u';
  const majorMin = Math.min(...possiblePlacements.map((placement) => placement[majorAxis]));
  const majorMax = Math.max(...possiblePlacements.map((placement) => placement[majorAxis]));
  const minorMin = Math.min(...possiblePlacements.map((placement) => placement[minorAxis]));
  const minorMax = Math.max(...possiblePlacements.map((placement) => placement[minorAxis]));
  const majorSpan = majorMax - majorMin;
  const minorSpan = minorMax - minorMin;
  const majorPadBase = Math.min(0.5, majorSpan * 0.18);
  const majorPad = Math.min(majorPadBase, Math.max(0.02, majorSpan * 0.08));
  const majorInnerMin = majorMin + majorPad;
  const majorInnerMax = majorMax - majorPad;
  const majorTargetMin = majorInnerMax > majorInnerMin ? majorInnerMin : majorMin;
  const majorTargetMax = majorInnerMax > majorInnerMin ? majorInnerMax : majorMax;
  const minorCenter = (minorMin + minorMax) / 2;
  const useGridLayout =
    requestedCount === 4
    && Math.min(uRange, vRange) >= Math.max(0.35, Math.max(uRange, vRange) * 0.32);

  const getTargetLayouts = () => {
    if (requestedCount === 1) {
      return [[{ major: (majorMin + majorMax) / 2, minor: minorCenter }]];
    }

    if (useGridLayout) {
      const uPad = Math.min(0.35, uRange * 0.18);
      const vPad = Math.min(0.35, vRange * 0.18);
      const uTargets = [
        uRange > uPad * 2 ? Math.min(...uValues) + uPad : (Math.min(...uValues) + Math.max(...uValues)) / 2,
        uRange > uPad * 2 ? Math.max(...uValues) - uPad : (Math.min(...uValues) + Math.max(...uValues)) / 2,
      ];
      const vTargets = [
        vRange > vPad * 2 ? Math.min(...vValues) + vPad : (Math.min(...vValues) + Math.max(...vValues)) / 2,
        vRange > vPad * 2 ? Math.max(...vValues) - vPad : (Math.min(...vValues) + Math.max(...vValues)) / 2,
      ];
      return [[
        { major: uTargets[0], minor: vTargets[0] },
        { major: uTargets[1], minor: vTargets[0] },
        { major: uTargets[0], minor: vTargets[1] },
        { major: uTargets[1], minor: vTargets[1] },
      ]];
    }

    const lineTargets = Array.from({ length: requestedCount }, (_, index) => {
      const ratio = requestedCount === 1 ? 0.5 : index / (requestedCount - 1);
      return {
        major: majorTargetMin + (majorTargetMax - majorTargetMin) * ratio,
        minor: minorCenter,
      };
    });
    const centeredTargets = Array.from({ length: requestedCount }, (_, index) => {
      const ratio = requestedCount === 1 ? 0.5 : index / (requestedCount - 1);
      const centerWeightedRatio = 0.18 + ratio * 0.64;
      return {
        major: majorMin + majorSpan * centerWeightedRatio,
        minor: minorCenter,
      };
    });
    return [lineTargets, centeredTargets];
  };

  const trySelect = (minSpacing: number) => {
    const selected: AutoScrewPlacementCandidate[] = [];
    for (const candidate of ranked) {
      const spacedEnough = selected.every((placed) => {
        const du = Math.abs(candidate.u - placed.u);
        const dv = Math.abs(candidate.v - placed.v);
        return Math.max(du, dv) >= minSpacing;
      });
      if (!spacedEnough) {
        continue;
      }
      selected.push(candidate);
      if (selected.length === requestedCount) {
        break;
      }
    }
    if (selected.length < requestedCount) {
      return null;
    }

    const uValues = selected.map((placement) => placement.u);
    const vValues = selected.map((placement) => placement.v);
    const spreadMajor = Math.max(
      Math.max(...uValues) - Math.min(...uValues),
      Math.max(...vValues) - Math.min(...vValues)
    );
    const comboScore =
      selected.reduce(
        (sum, placement) => sum + placement.score + getPlacementSafetyScore(placement) * 0.9,
        0
      )
      + spreadMajor * 0.3
      + minSpacing * 0.15
      + directionBonus;

    return {
      placements: selected,
      score: comboScore,
    };
  };

  const trySelectAnchored = (minSpacing: number) => {
    let best:
      | {
          placements: AutoScrewPlacementCandidate[];
          score: number;
        }
      | null = null;

    for (const targets of getTargetLayouts()) {
      const chosen: AutoScrewPlacementCandidate[] = [];
      const used = new Set<number>();
      let totalDeviation = 0;

      for (const target of targets) {
        let bestIndex = -1;
        let bestTargetScore = -Infinity;

        for (let i = 0; i < ranked.length; i += 1) {
          if (used.has(i)) continue;
          const candidate = ranked[i];
          const spacedEnough = chosen.every((placed) => {
            const du = Math.abs(candidate.u - placed.u);
            const dv = Math.abs(candidate.v - placed.v);
            return Math.max(du, dv) >= minSpacing;
          });
          if (!spacedEnough) {
            continue;
          }

          const candidateMajor = useGridLayout
            ? candidate.u
            : candidate[majorAxis];
          const candidateMinor = useGridLayout
            ? candidate.v
            : candidate[minorAxis];
          const majorDistance = Math.abs(candidateMajor - target.major);
          const minorDistance = Math.abs(candidateMinor - target.minor);
          const targetScore =
            getPlacementQuality(candidate)
            - majorDistance * 3.4
            - minorDistance * (useGridLayout ? 2.4 : 1.35);

          if (targetScore > bestTargetScore) {
            bestTargetScore = targetScore;
            bestIndex = i;
          }
        }

        if (bestIndex < 0) {
          chosen.length = 0;
          break;
        }

        const picked = ranked[bestIndex];
        used.add(bestIndex);
        chosen.push(picked);
        const pickedMajor = useGridLayout ? picked.u : picked[majorAxis];
        const pickedMinor = useGridLayout ? picked.v : picked[minorAxis];
        totalDeviation +=
          Math.abs(pickedMajor - target.major)
          + Math.abs(pickedMinor - target.minor) * (useGridLayout ? 1.2 : 0.65);
      }

      if (chosen.length < requestedCount) {
        continue;
      }

      const chosenU = chosen.map((placement) => placement.u);
      const chosenV = chosen.map((placement) => placement.v);
      const spreadMajor = Math.max(
        Math.max(...chosenU) - Math.min(...chosenU),
        Math.max(...chosenV) - Math.min(...chosenV)
      );
      const comboScore =
        chosen.reduce(
          (sum, placement) => sum + placement.score + getPlacementSafetyScore(placement) * 0.95,
          0
        )
        + spreadMajor * 0.42
        + minSpacing * 0.18
        + directionBonus
        - totalDeviation * 0.95;

      if (!best || comboScore > best.score) {
        best = {
          placements: chosen,
          score: comboScore,
        };
      }
    }

    return best;
  };

  const spacingAttempts = [
    Math.max(0.12, options.targetSpacing * (options.tightSpace ? 0.52 : 0.62)),
    Math.max(0.08, options.targetSpacing * (options.tightSpace ? 0.34 : 0.42)),
    0,
  ];

  for (const spacing of spacingAttempts) {
    const anchored = trySelectAnchored(spacing);
    if (anchored) {
      return anchored;
    }
    const selected = trySelect(spacing);
    if (selected) {
      return selected;
    }
  }

  return null;
};

interface AppState {
  parts: PartData[];
  pastParts: PartData[][];
  futureParts: PartData[][];
  selectedId: string | null;
  hoveredId: string | null;
  lastDuplicatedId: string | null;
  lastDuplicatedAt: number;
  tool: ToolType;
  sawPartId: string | null;
  sawFace: SawFaceState | null;
  sawPath: [number, number][];
  sawPreviewPoint: [number, number] | null;
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
  duplicatePart: (id: string, options?: { selectDuplicate?: boolean; offset?: [number, number, number] }) => void;
  attachPartToHinge: (partId: string, hingeId: string) => void;
  detachPartFromHinge: (partId: string) => void;
  setHingeAngle: (hingeId: string, angle: number) => void;
  autoScrewParts: (firstId: string, secondId: string, requestedCount?: number) => AutoScrewResult;
  setSawDraftPart: (partId: string | null, face?: SawFaceState | null) => void;
  addSawPoint: (point: [number, number]) => void;
  setSawPreviewPoint: (point: [number, number] | null) => void;
  clearSawPath: () => void;
  commitSawCut: () => { ok: boolean; message: string };
  setTool: (tool: ToolType) => void;
  resetScene: () => void;
  setParts: (parts: PartData[]) => void;
  snapEnabled: boolean;
  toggleSnap: () => void;
  edgeSnapEnabled: boolean;
  toggleEdgeSnap: () => void;
  selectAssistEnabled: boolean;
  toggleSelectAssist: () => void;
  undo: () => void;
  redo: () => void;
  floorEnabled: boolean;
  toggleFloor: () => void;
  shadowsEnabled: boolean;
  toggleShadows: () => void;
  structuralOverlayEnabled: boolean;
  toggleStructuralOverlay: () => void;
  stressScenario: StressScenario;
  setStressScenario: (scenario: StressScenario) => void;
  stressIntensity: number;
  setStressIntensity: (value: number) => void;
  requestCameraFocus: () => void;
  setExplodeFactor: (value: number) => void;
}

export const useStore = create<AppState>((set) => ({
  parts: [],
  pastParts: [],
  futureParts: [],
  selectedId: null,
  hoveredId: null,
  lastDuplicatedId: null,
  lastDuplicatedAt: 0,
  tool: 'select',
  sawPartId: null,
  sawFace: null,
  sawPath: [],
  sawPreviewPoint: null,
  explodeFactor: 0,
  cameraFocusRequest: 0,
  snapEnabled: true, // Default to true for easier alignment
  edgeSnapEnabled: true,
  selectAssistEnabled: false,
  floorEnabled: false,
  shadowsEnabled: false,
  structuralOverlayEnabled: false,
  stressScenario: 'baseline',
  stressIntensity: 0.6,

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
      sawPartId: state.sawPartId === id ? null : state.sawPartId,
      sawFace: state.sawPartId === id ? null : state.sawFace,
      sawPath: state.sawPartId === id ? [] : state.sawPath,
      sawPreviewPoint: state.sawPartId === id ? null : state.sawPreviewPoint,
    });
  }),

  selectPart: (id) => set((state) => ({
    selectedId: id,
    ...(state.tool === 'saw' && state.sawPartId !== id
      ? { sawPartId: id, sawFace: null, sawPath: [], sawPreviewPoint: null }
      : {}),
  })),

  setHoveredId: (id) => set({ hoveredId: id }),

  duplicatePart: (id, options) => set((state) => {
    const partToDuplicate = state.parts.find((p) => p.id === id);
    if (!partToDuplicate) return {};

    const shouldSelectDuplicate = options?.selectDuplicate ?? true;
    const offset = options?.offset ?? [0, 0, 0];
    const newPart: PartData = {
      ...partToDuplicate,
      id: uuidv4(),
      position: [
        partToDuplicate.position[0] + offset[0],
        partToDuplicate.position[1] + offset[1],
        partToDuplicate.position[2] + offset[2],
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

    return withHistory(state, [...state.parts, newPart], {
      selectedId: shouldSelectDuplicate ? newPart.id : state.selectedId,
      lastDuplicatedId: newPart.id,
      lastDuplicatedAt: Date.now(),
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

  autoScrewParts: (firstId, secondId, requestedCount = AUTO_SCREW_DEFAULT_COUNT) => {
    const targetScrewCount = clampAutoScrewCount(requestedCount);
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
        const firstSpan = alongFirst.max - alongFirst.min;
        const secondSpan = alongSecond.max - alongSecond.min;
        const thinnerSpan = Math.min(firstSpan, secondSpan);
        const allowedAxisOverlap = Math.min(
          AUTO_SCREW_MAX_AXIS_OVERLAP,
          Math.max(0.2, thinnerSpan * AUTO_SCREW_MAX_AXIS_OVERLAP_RATIO)
        );
        if (alongGap > AUTO_SCREW_CONTACT_GAP_TOLERANCE) {
          continue;
        }
        if (alongOverlap > allowedAxisOverlap) {
          continue;
        }
        foundTouchingDirection = true;

        const basisCandidates = [getBasisForDirection(dir)];
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

          const possiblePlacements: AutoScrewPlacementCandidate[] = [];
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

              const screwStart = -chosenSegment.preset.length / 2;
              const screwEnd = chosenSegment.preset.length / 2;
              const firstLineRelative = {
                start: firstLine.start - chosenSegment.center,
                end: firstLine.end - chosenSegment.center,
              };
              const secondLineRelative = {
                start: secondLine.start - chosenSegment.center,
                end: secondLine.end - chosenSegment.center,
              };
              const firstContainment = summarizeSegmentContainment(
                firstFrame,
                firstFootprint,
                screwCenter,
                basis.dir,
                Math.max(screwStart, firstLineRelative.start),
                Math.min(screwEnd, firstLineRelative.end),
                false
              );
              const secondContainment = summarizeSegmentContainment(
                secondFrame,
                secondFootprint,
                screwCenter,
                basis.dir,
                Math.max(screwStart, secondLineRelative.start),
                Math.min(screwEnd, secondLineRelative.end),
                true
              );
              if (!firstContainment || !secondContainment) {
                continue;
              }
              const radialContainmentRadius = chosenSegment.preset.diameter * 0.52;
              const firstRadiallyContained = isSegmentRadiallyContained(
                firstFrame,
                firstFootprint,
                screwCenter,
                basis.dir,
                basis.u,
                basis.v,
                Math.max(screwStart, firstLineRelative.start),
                Math.min(screwEnd, firstLineRelative.end),
                radialContainmentRadius
              );
              const secondRadiallyContained = isSegmentRadiallyContained(
                secondFrame,
                secondFootprint,
                screwCenter,
                basis.dir,
                basis.u,
                basis.v,
                Math.max(screwStart, secondLineRelative.start),
                Math.min(screwEnd, secondLineRelative.end),
                radialContainmentRadius
              );
              if (!firstRadiallyContained || !secondRadiallyContained) {
                continue;
              }

              const projectedEdgeMargin = Math.min(
                uVal - uFirst.min,
                uFirst.max - uVal,
                vVal - vFirst.min,
                vFirst.max - vVal,
                uVal - uSecond.min,
                uSecond.max - uVal,
                vVal - vSecond.min,
                vSecond.max - vVal
              );
              const edgeMargin = Math.min(
                projectedEdgeMargin,
                firstContainment.minMargin,
                secondContainment.minMargin
              );
              const centerBias =
                Math.abs(uVal - (overlapUMin + overlapUMax) / 2)
                + Math.abs(vVal - (overlapVMin + overlapVMax) / 2);
              const edgeBonus = Math.max(0, Math.min(0.4, edgeMargin - minEdgeClearance));
              const seamOffset = Math.abs(chosenSegment.center - chosenSegment.seamCenter);
              const destinationCoreMargin = Math.min(
                secondContainment.minMargin,
                secondContainment.seamMargin
              );
              const desiredDestinationMargin = Math.max(
                chosenSegment.preset.diameter * 0.24,
                0.03
              );
              const desiredGeneralMargin = Math.max(
                chosenSegment.preset.diameter * 0.18,
                0.025
              );
              const edgeRiskPenalty =
                Math.max(0, desiredDestinationMargin - destinationCoreMargin) * 18
                + Math.max(0, desiredGeneralMargin - secondContainment.averageMargin) * 10
                + Math.max(0, desiredGeneralMargin - edgeMargin) * 9
                + Math.max(0, 0.02 - firstContainment.minMargin) * 7;
              const containmentBonus =
                firstContainment.averageMargin * 0.4
                + secondContainment.averageMargin * 1.6
                + secondContainment.seamMargin * 2.35
                + secondContainment.farMargin * 0.9
                + Math.min(firstContainment.minMargin, secondContainment.minMargin) * 0.45;

              possiblePlacements.push({
                center: screwCenter,
                preset: chosenSegment.preset,
                u: uVal,
                v: vVal,
                edgeMargin,
                firstContainment,
                secondContainment,
                score:
                  chosenSegment.overlapFirst
                  + chosenSegment.overlapSecond
                  + penetrationFirst
                  + penetrationSecond
                  - lineGap * 1.75
                  - seamOffset * 0.2
                  - centerBias * 0.08
                  - edgeRiskPenalty
                  + edgeBonus * 0.45
                  + containmentBonus,
              });
            }
          }

          if (possiblePlacements.length < targetScrewCount) {
            continue;
          }

          const maxOverlap = Math.max(overlapU, overlapV);
          const tightSpace = minOverlap < 1.6 || maxOverlap < 2.25;
          const targetSpacing = tightSpace
            ? Math.max(0.16, Math.min(0.8, maxOverlap * 0.26))
            : Math.max(0.3, Math.min(1.4, maxOverlap * 0.35));
          const selectedSet = chooseBestPlacementSet(possiblePlacements, targetScrewCount, {
            targetSpacing,
            tightSpace,
            dirAlignment,
            alongOverlap,
          });

          if (!selectedSet) {
            continue;
          }

          const screwRotation = toEulerTuple(
            new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), basis.dir)
          );
          const planScrews: PartData[] = selectedSet.placements.map((placement) => ({
            id: uuidv4(),
            name: placement.preset.name,
            type: 'hardware',
            hardwareKind: 'fastener',
            dimensions: [placement.preset.diameter, placement.preset.length, placement.preset.diameter],
            position: [placement.center.x, placement.center.y, placement.center.z],
            rotation: screwRotation,
            color: '#9ca3af',
          }));

          if (!bestPlan || selectedSet.score > bestPlan.score) {
            const preferredAxisBias = Math.max(
              ...firstFrame.axes.map((axis) => Math.abs(axis.dot(basis.dir)))
            );
            bestPlan = {
              score: selectedSet.score + preferredAxisBias * 0.3,
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
          message: `Could not place ${formatScrewCountLabel(targetScrewCount)} that intersect both selected pieces.`,
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
        if (getIntervalGap(firstLine, secondLine) > AUTO_SCREW_CONTACT_GAP_TOLERANCE) {
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
        const firstContainment = summarizeSegmentContainment(
          firstFrame,
          firstFootprint,
          screwCenter,
          screwDir,
          Math.max(segStart, firstLine.start),
          Math.min(segEnd, firstLine.end),
          false
        );
        const secondContainment = summarizeSegmentContainment(
          secondFrame,
          secondFootprint,
          screwCenter,
          screwDir,
          Math.max(segStart, secondLine.start),
          Math.min(segEnd, secondLine.end),
          true
        );
        if (!firstContainment || !secondContainment) {
          return false;
        }
        const basis = getBasisForDirection(screwDir);
        const radialContainmentRadius = screw.dimensions[0] * 0.52;
        const firstRadiallyContained = isSegmentRadiallyContained(
          firstFrame,
          firstFootprint,
          screwCenter,
          screwDir,
          basis.u,
          basis.v,
          Math.max(segStart, firstLine.start),
          Math.min(segEnd, firstLine.end),
          radialContainmentRadius
        );
        const secondRadiallyContained = isSegmentRadiallyContained(
          secondFrame,
          secondFootprint,
          screwCenter,
          screwDir,
          basis.u,
          basis.v,
          Math.max(segStart, secondLine.start),
          Math.min(segEnd, secondLine.end),
          radialContainmentRadius
        );
        return (
          penetrationFirst >= requiredPenetration
          && penetrationSecond >= requiredPenetration
          && firstRadiallyContained
          && secondRadiallyContained
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
        message: `Placed ${formatScrewCountLabel(bestPlan.screws.length)}.`,
        screwCount: bestPlan.screws.length,
      };
      return withHistory(state, [...state.parts, ...bestPlan.screws], {
        selectedId: secondId,
      });
    });

    return result;
  },

  setSawDraftPart: (partId, face = null) => set((state) => ({
    sawPartId: partId,
    sawFace: face,
    sawPath: state.sawPartId === partId ? state.sawPath : [],
    sawPreviewPoint: null,
    selectedId: partId ?? state.selectedId,
  })),

  addSawPoint: (point) => set((state) => {
    if (!state.sawPartId) {
      return {};
    }
    const nextPath = state.sawPath.length > 0 && pointsClose2d(state.sawPath[state.sawPath.length - 1], point)
      ? state.sawPath
      : [...state.sawPath, point];
    return {
      sawPath: nextPath,
      sawPreviewPoint: null,
    };
  }),

  setSawPreviewPoint: (point) => set({ sawPreviewPoint: point }),

  clearSawPath: () => set({
    sawPartId: null,
    sawFace: null,
    sawPath: [],
    sawPreviewPoint: null,
  }),

  commitSawCut: () => {
    let result = { ok: false, message: 'Saw path is not ready.' };

    set((state) => {
      if (!state.sawPartId) {
        result = { ok: false, message: 'Select a wood or sheet part first.' };
        return {};
      }

      const source = state.parts.find((part) => part.id === state.sawPartId);
      if (!source || source.type === 'hardware') {
        result = { ok: false, message: 'Saw only works on wood or sheet parts.' };
        return {};
      }

      const face = state.sawFace ?? { plane: 'xz' as const, normalSign: 1 as const };
      const split = splitPolygonWithSawPath(getSawPlanePolygon(source, face.plane), state.sawPath);
      if (!split) {
        result = {
          ok: false,
          message: 'Saw path must start and end on the edge and stay inside the selected face.',
        };
        return {};
      }

      const first = createPartFromSawPolygon(source, split[0], face, `${source.name} A`);
      const second = createPartFromSawPolygon(source, split[1], face, `${source.name} B`);
      if (!first || !second) {
        result = { ok: false, message: 'Could not split that part with the current saw path.' };
        return {};
      }

      const nextParts = state.parts.flatMap((part) => {
        if (part.id !== source.id) return [part];
        return [first, second];
      });

      result = { ok: true, message: 'Split part into two pieces.' };
      return withHistory(state, nextParts, {
        selectedId: first.id,
        sawPartId: null,
        sawFace: null,
        sawPath: [],
        sawPreviewPoint: null,
      });
    });

    return result;
  },

  setTool: (tool) => set((state) => ({
    tool,
    sawPreviewPoint: null,
    ...(tool === 'saw'
      ? {}
      : {
          sawPartId: null,
          sawFace: null,
          sawPath: [],
        }),
    hoveredId: tool === 'auto-screw' || tool === 'select' ? state.hoveredId : null,
  })),

  resetScene: () => set((state) =>
    withHistory(state, [], {
      selectedId: null,
      hoveredId: null,
      sawPartId: null,
      sawFace: null,
      sawPath: [],
      sawPreviewPoint: null,
      explodeFactor: 0,
      cameraFocusRequest: 0,
    })
  ),

  setParts: (parts) => set((state) =>
    withHistory(state, rebuildAllAttachments(parts), {
      selectedId: null,
      hoveredId: null,
      sawPartId: null,
      sawFace: null,
      sawPath: [],
      sawPreviewPoint: null,
    })
  ),

  toggleSnap: () => set((state) => ({ snapEnabled: !state.snapEnabled })),

  toggleEdgeSnap: () => set((state) => ({ edgeSnapEnabled: !state.edgeSnapEnabled })),

  toggleSelectAssist: () => set((state) => {
    const nextValue = !state.selectAssistEnabled;
    return {
      selectAssistEnabled: nextValue,
      hoveredId: nextValue ? state.hoveredId : null,
    };
  }),

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

  toggleStructuralOverlay: () => set((state) => ({ structuralOverlayEnabled: !state.structuralOverlayEnabled })),

  setStressScenario: (scenario) => set({ stressScenario: scenario }),

  setStressIntensity: (value) => set({ stressIntensity: Math.max(0, Math.min(1, value)) }),

  requestCameraFocus: () => set((state) => ({ cameraFocusRequest: state.cameraFocusRequest + 1 })),

  setExplodeFactor: (value) => set({ explodeFactor: Math.max(0, Math.min(1, value)) }),
}));
