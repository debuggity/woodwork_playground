import * as THREE from 'three';
import { PartData } from './types';

type Axis = 'x' | 'y' | 'z';

export type StressScenario = 'baseline' | 'vertical-load' | 'lateral-rack' | 'torsion-twist' | 'impact-burst';

export type StructuralAnalysisOptions = {
  stressScenario?: StressScenario;
  stressIntensity?: number;
};

type Bounds3 = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

type ContactEdge = {
  axis: Axis;
  area: number;
};

type SupportPatch = {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
  area: number;
  belowId?: string;
};

type LocalPlanSupportPoint = {
  x: number;
  z: number;
  intensity: number;
};

type PlanSupportMetrics = {
  centerSupport: number;
  edgeSupport: number;
  cornerSupport: number;
  averageSupport: number;
  cornerScores: [number, number, number, number];
};

type OrientedFrame = {
  center: THREE.Vector3;
  half: [number, number, number];
  axes: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
};

type PartMode = 'beam' | 'panel' | 'shear-panel' | 'column' | 'joint' | 'general';

type PartDiagnostics = {
  mode: PartMode;
  governingAxis: Axis;
  supportAdequacy: number;
  deflectionIn: number;
  deflectionRatio: number;
  bendingStressPsi: number;
  bendingRatio: number;
  axialLoadLb: number;
  axialRatio: number;
  rackRatio: number;
  totalLoadLb: number;
  recommendation: string;
};

export type StructuralPoint = {
  x: number;
  y: number;
  z: number;
  intensity: number;
};

export type StructuralPartField = {
  baseStability: number;
  supportPatternScore: number;
  supportPoints: StructuralPoint[];
  loadPoints: StructuralPoint[];
  fastenerPoints: StructuralPoint[];
  primarySpanAxis: Axis;
  memberMode: PartMode;
};

export type StructuralReport = {
  overallScore: number;
  grade: string;
  recommendation: string;
  stress: {
    scenario: StressScenario;
    label: string;
    description: string;
    intensity: number;
    score: number;
    grade: string;
    recommendation: string;
  };
  partScores: Record<string, number>;
  partFields: Record<string, StructuralPartField>;
  weakPartIds: string[];
  stats: {
    partCount: number;
    woodPartCount: number;
    hardwareCount: number;
    fastenerCount: number;
    bridgingFasteners: number;
    fastenerEngagement: number;
    lumberCount: number;
    sheetCount: number;
    connectedGroups: number;
    groundedParts: number;
    averageConnections: number;
    supportCoverage: number;
    totalVolumeCuIn: number;
    totalVolumeCuFt: number;
    estimatedWeightLb: number;
    footprintSqFt: number;
    maxSpanIn: number;
    modelHeightIn: number;
    centerOfMassHeightIn: number;
    symmetryScore: number;
    worstDeflectionIn: number;
    worstDeflectionRatio: number;
    worstBendingRatio: number;
    worstAxialRatio: number;
    worstRackRatio: number;
  };
};

const EPS = 1e-5;
const CONTACT_TOLERANCE = 0.22;
const MIN_OVERLAP = 0.08;
const MIN_CONTACT_AREA = 0.05;
const GROUND_TOLERANCE = 0.18;
const WORLD_UP = new THREE.Vector3(0, 1, 0);

const GENERIC_MATERIAL = {
  lumber: {
    densityPcf: 35,
    modulusPsi: 1_200_000,
    bendingAllowPsi: 900,
    compressionAllowPsi: 1_150,
  },
  sheet: {
    densityPcf: 34,
    modulusPsi: 1_000_000,
    bendingAllowPsi: 2_500,
    compressionAllowPsi: 900,
  },
} as const;

type StressProfile = {
  id: StressScenario;
  label: string;
  description: string;
  addedVerticalPsF: number;
  lateralFactor: number;
  torsionFactor: number;
  impactPointLoadLb: number;
};

const STRESS_PROFILES: Record<StressScenario, StressProfile> = {
  baseline: {
    id: 'baseline',
    label: 'Baseline',
    description: 'Dead load plus stacked part load transfer. Best for checking sag, span, and support quality.',
    addedVerticalPsF: 8,
    lateralFactor: 0,
    torsionFactor: 0,
    impactPointLoadLb: 0,
  },
  'vertical-load': {
    id: 'vertical-load',
    label: 'Vertical Load',
    description: 'Adds realistic top-down live load to expose lumber bending and plywood sag.',
    addedVerticalPsF: 120,
    lateralFactor: 0.12,
    torsionFactor: 0.08,
    impactPointLoadLb: 0,
  },
  'lateral-rack': {
    id: 'lateral-rack',
    label: 'Side Racking',
    description: 'Checks tall unsupported frames for sway and poor bracing under side load.',
    addedVerticalPsF: 30,
    lateralFactor: 0.3,
    torsionFactor: 0.1,
    impactPointLoadLb: 0,
  },
  'torsion-twist': {
    id: 'torsion-twist',
    label: 'Twist Torque',
    description: 'Applies eccentric top loading to expose uneven support and torsional twist risk.',
    addedVerticalPsF: 55,
    lateralFactor: 0.18,
    torsionFactor: 0.26,
    impactPointLoadLb: 0,
  },
  'impact-burst': {
    id: 'impact-burst',
    label: 'Impact Burst',
    description: 'Adds a concentrated point load to highlight brittle local spans and poorly supported panels.',
    addedVerticalPsF: 35,
    lateralFactor: 0.14,
    torsionFactor: 0.1,
    impactPointLoadLb: 180,
  },
};

export const STRESS_SCENARIO_OPTIONS = Object.values(STRESS_PROFILES).map((profile) => ({
  id: profile.id,
  label: profile.label,
  description: profile.description,
}));

const HEAT_STOPS: Array<{ t: number; color: string }> = [
  { t: 0, color: '#dc2626' },
  { t: 0.22, color: '#f97316' },
  { t: 0.42, color: '#facc15' },
  { t: 0.64, color: '#84cc16' },
  { t: 0.82, color: '#10b981' },
  { t: 1, color: '#06b6d4' },
];

const clamp = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
};

const overlap = (aMin: number, aMax: number, bMin: number, bMax: number) =>
  Math.max(0, Math.min(aMax, bMax) - Math.max(aMin, bMin));

const gap = (aMin: number, aMax: number, bMin: number, bMax: number) =>
  Math.max(0, Math.max(aMin - bMax, bMin - aMax));

const midpoint = (a: number, b: number) => (a + b) / 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const hexToRgb = (hex: string): [number, number, number] => {
  const normalized = hex.replace('#', '');
  const full = normalized.length === 3
    ? normalized.split('').map((c) => `${c}${c}`).join('')
    : normalized;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const rgbToHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')).join('')}`;

const applyHeatContrast = (value: number) => {
  const t = clamp(value, 0, 1);
  if (t < 0.5) return 0.5 * Math.pow(t / 0.5, 1.25);
  return 1 - 0.5 * Math.pow((1 - t) / 0.5, 1.25);
};

export const getStructuralHeatColor = (score: number) => {
  const t = applyHeatContrast(score);
  for (let i = 0; i < HEAT_STOPS.length - 1; i += 1) {
    const start = HEAT_STOPS[i];
    const end = HEAT_STOPS[i + 1];
    if (t >= start.t && t <= end.t) {
      const local = (t - start.t) / Math.max(end.t - start.t, EPS);
      const [r1, g1, b1] = hexToRgb(start.color);
      const [r2, g2, b2] = hexToRgb(end.color);
      return rgbToHex(lerp(r1, r2, local), lerp(g1, g2, local), lerp(b1, b2, local));
    }
  }
  return HEAT_STOPS[HEAT_STOPS.length - 1].color;
};

const getGrade = (score: number) => {
  if (score >= 0.93) return 'A';
  if (score >= 0.84) return 'B';
  if (score >= 0.72) return 'C';
  if (score >= 0.58) return 'D';
  return 'F';
};

const buildOrientedFrame = (part: PartData): OrientedFrame => {
  const quaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(part.rotation[0], part.rotation[1], part.rotation[2], 'XYZ')
  );
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

const toFrameLocal = (frame: OrientedFrame, worldPoint: THREE.Vector3) => {
  const delta = worldPoint.clone().sub(frame.center);
  return new THREE.Vector3(
    delta.dot(frame.axes[0]),
    delta.dot(frame.axes[1]),
    delta.dot(frame.axes[2])
  );
};

const getWorldCorners = (frame: OrientedFrame) => {
  const [hx, hy, hz] = frame.half;
  const corners: THREE.Vector3[] = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        corners.push(
          frame.center.clone()
            .add(frame.axes[0].clone().multiplyScalar(sx * hx))
            .add(frame.axes[1].clone().multiplyScalar(sy * hy))
            .add(frame.axes[2].clone().multiplyScalar(sz * hz))
        );
      }
    }
  }
  return corners;
};

const getBounds = (part: PartData): Bounds3 => {
  const corners = getWorldCorners(buildOrientedFrame(part));
  return {
    minX: Math.min(...corners.map((c) => c.x)),
    maxX: Math.max(...corners.map((c) => c.x)),
    minY: Math.min(...corners.map((c) => c.y)),
    maxY: Math.max(...corners.map((c) => c.y)),
    minZ: Math.min(...corners.map((c) => c.z)),
    maxZ: Math.max(...corners.map((c) => c.z)),
  };
};

const getContactEdge = (a: Bounds3, b: Bounds3): ContactEdge | null => {
  const overlapX = overlap(a.minX, a.maxX, b.minX, b.maxX);
  const overlapY = overlap(a.minY, a.maxY, b.minY, b.maxY);
  const overlapZ = overlap(a.minZ, a.maxZ, b.minZ, b.maxZ);
  const gapX = gap(a.minX, a.maxX, b.minX, b.maxX);
  const gapY = gap(a.minY, a.maxY, b.minY, b.maxY);
  const gapZ = gap(a.minZ, a.maxZ, b.minZ, b.maxZ);

  const candidates: ContactEdge[] = [];
  if (gapX <= CONTACT_TOLERANCE && overlapY >= MIN_OVERLAP && overlapZ >= MIN_OVERLAP) {
    candidates.push({ axis: 'x', area: overlapY * overlapZ });
  }
  if (gapY <= CONTACT_TOLERANCE && overlapX >= MIN_OVERLAP && overlapZ >= MIN_OVERLAP) {
    candidates.push({ axis: 'y', area: overlapX * overlapZ });
  }
  if (gapZ <= CONTACT_TOLERANCE && overlapX >= MIN_OVERLAP && overlapY >= MIN_OVERLAP) {
    candidates.push({ axis: 'z', area: overlapX * overlapY });
  }

  if (candidates.length === 0) return null;
  candidates.sort((lhs, rhs) => rhs.area - lhs.area);
  return candidates[0].area >= MIN_CONTACT_AREA ? candidates[0] : null;
};

const getPartMaterial = (part: PartData) =>
  part.type === 'sheet' ? GENERIC_MATERIAL.sheet : GENERIC_MATERIAL.lumber;

const getPartWeightLb = (part: PartData) => {
  const volumeFt3 = (part.dimensions[0] * part.dimensions[1] * part.dimensions[2]) / 1728;
  return volumeFt3 * getPartMaterial(part).densityPcf;
};

const normalizeRiskToScore = (risk: number) => clamp(1 - clamp(risk, 0, 1.5) / 1.5, 0, 1);
const areaLoadToTotalLoad = (psf: number, areaSqIn: number) => (psf / 144) * areaSqIn;

const calcRectSection = (breadthIn: number, depthIn: number) => {
  const breadth = Math.max(breadthIn, 0.1);
  const depth = Math.max(depthIn, 0.1);
  const inertia = (breadth * Math.pow(depth, 3)) / 12;
  const sectionModulus = (breadth * Math.pow(depth, 2)) / 6;
  const area = breadth * depth;
  const radius = Math.sqrt(inertia / Math.max(area, EPS));
  return { inertia, sectionModulus, area, radius };
};

const computeSupportAdequacy = (span: number, supportCoords: number[], halfSpan: number) => {
  if (span <= 0.5) return 1;
  if (supportCoords.length === 0) return 0.05;
  const sorted = [...supportCoords].sort((a, b) => a - b);
  const outerCoverage = clamp((sorted[sorted.length - 1] - sorted[0]) / Math.max(span, EPS), 0, 1);
  const edgeProximity = clamp(
    1 - ((Math.abs(sorted[0] + halfSpan) + Math.abs(sorted[sorted.length - 1] - halfSpan)) / Math.max(span, EPS)),
    0,
    1
  );
  const countBonus = clamp(Math.log2(sorted.length + 1) / 2.5, 0, 1) * 0.25;
  return clamp(outerCoverage * 0.5 + edgeProximity * 0.25 + countBonus, 0, 1);
};

const estimateBeamSpan = (
  length: number,
  halfLength: number,
  supportCoords: number[]
): { span: number; condition: 'continuous' | 'simple' | 'cantilever' | 'free'; adequacy: number } => {
  if (length <= 0.5) return { span: 0, condition: 'continuous', adequacy: 1 };
  if (supportCoords.length === 0) return { span: length, condition: 'free', adequacy: 0.05 };

  const sorted = [...supportCoords].sort((a, b) => a - b);
  const adequacy = computeSupportAdequacy(length, sorted, halfLength);
  if (sorted.length >= 2 && sorted[sorted.length - 1] - sorted[0] >= length * 0.35) {
    return { span: sorted[sorted.length - 1] - sorted[0], condition: 'simple', adequacy };
  }

  const lone = sorted[Math.floor(sorted.length / 2)];
  return {
    span: Math.max(Math.abs(-halfLength - lone), Math.abs(halfLength - lone)),
    condition: 'cantilever',
    adequacy,
  };
};

const beamUniformDeflection = (
  totalLoadLb: number,
  spanIn: number,
  modulusPsi: number,
  inertia: number,
  condition: 'simple' | 'cantilever' | 'free'
) => {
  if (spanIn <= EPS || inertia <= EPS) return 0;
  const w = totalLoadLb / Math.max(spanIn, EPS);
  if (condition === 'cantilever' || condition === 'free') {
    return (w * Math.pow(spanIn, 4)) / (8 * modulusPsi * inertia);
  }
  return (5 * w * Math.pow(spanIn, 4)) / (384 * modulusPsi * inertia);
};

const beamUniformBendingStress = (
  totalLoadLb: number,
  spanIn: number,
  sectionModulus: number,
  condition: 'simple' | 'cantilever' | 'free'
) => {
  if (spanIn <= EPS || sectionModulus <= EPS) return 0;
  const w = totalLoadLb / Math.max(spanIn, EPS);
  const maxMoment = condition === 'cantilever' || condition === 'free'
    ? (w * Math.pow(spanIn, 2)) / 2
    : (w * Math.pow(spanIn, 2)) / 8;
  return maxMoment / sectionModulus;
};

const pointLoadDeflection = (
  pointLoadLb: number,
  spanIn: number,
  modulusPsi: number,
  inertia: number,
  condition: 'simple' | 'cantilever' | 'free'
) => {
  if (spanIn <= EPS || inertia <= EPS || pointLoadLb <= EPS) return 0;
  if (condition === 'cantilever' || condition === 'free') {
    return (pointLoadLb * Math.pow(spanIn, 3)) / (3 * modulusPsi * inertia);
  }
  return (pointLoadLb * Math.pow(spanIn, 3)) / (48 * modulusPsi * inertia);
};

const pointLoadBendingStress = (
  pointLoadLb: number,
  spanIn: number,
  sectionModulus: number,
  condition: 'simple' | 'cantilever' | 'free'
) => {
  if (spanIn <= EPS || sectionModulus <= EPS || pointLoadLb <= EPS) return 0;
  const maxMoment = condition === 'cantilever' || condition === 'free'
    ? pointLoadLb * spanIn
    : (pointLoadLb * spanIn) / 4;
  return maxMoment / sectionModulus;
};

const buildPatchSamples = (min: number, max: number) => {
  const span = Math.max(max - min, 0);
  const center = midpoint(min, max);
  if (span <= 0.12) return [center];
  const inset = Math.min(span * 0.24, 0.7);
  return [min + inset, center, max - inset];
};

const pushDistributedPatchPoints = (
  target: Map<string, StructuralPoint[]>,
  partId: string,
  patch: SupportPatch,
  y: number,
  baseIntensity: number
) => {
  const xs = buildPatchSamples(patch.xMin, patch.xMax);
  const zs = buildPatchSamples(patch.zMin, patch.zMax);
  const list = target.get(partId) ?? [];
  const centerX = midpoint(patch.xMin, patch.xMax);
  const centerZ = midpoint(patch.zMin, patch.zMax);
  const halfX = Math.max((patch.xMax - patch.xMin) / 2, EPS);
  const halfZ = Math.max((patch.zMax - patch.zMin) / 2, EPS);

  xs.forEach((x) => {
    zs.forEach((z) => {
      const radial = Math.hypot((x - centerX) / halfX, (z - centerZ) / halfZ);
      list.push({
        x,
        y,
        z,
        intensity: clamp(baseIntensity * clamp(1 - radial * 0.22, 0.72, 1), 0.12, 1),
      });
    });
  });

  target.set(partId, list);
};

const projectSupportCoords = (frame: OrientedFrame, patches: SupportPatch[]) => {
  const supportXs: number[] = [];
  const supportZs: number[] = [];

  patches.forEach((patch) => {
    const samplePoints = [
      new THREE.Vector3(patch.xMin, frame.center.y - frame.half[1], patch.zMin),
      new THREE.Vector3(patch.xMax, frame.center.y - frame.half[1], patch.zMin),
      new THREE.Vector3(patch.xMin, frame.center.y - frame.half[1], patch.zMax),
      new THREE.Vector3(patch.xMax, frame.center.y - frame.half[1], patch.zMax),
      new THREE.Vector3(midpoint(patch.xMin, patch.xMax), frame.center.y - frame.half[1], midpoint(patch.zMin, patch.zMax)),
    ];

    samplePoints.forEach((point) => {
      const local = toFrameLocal(frame, point);
      supportXs.push(local.x);
      supportZs.push(local.z);
    });
  });

  return { supportXs, supportZs };
};

const projectStructuralPointsToPlanLocal = (
  frame: OrientedFrame,
  points: StructuralPoint[],
  intensityScale = 1
): LocalPlanSupportPoint[] =>
  points.map((point) => {
    const local = toFrameLocal(frame, new THREE.Vector3(point.x, point.y, point.z));
    return {
      x: local.x,
      z: local.z,
      intensity: clamp(point.intensity * intensityScale, 0.08, 1),
    };
  });

const getPlanSupportInfluence = (
  x: number,
  z: number,
  width: number,
  depth: number,
  supports: LocalPlanSupportPoint[]
) => {
  if (supports.length === 0) return 0;
  const radius = Math.max(Math.min(width, depth) * 0.22, 0.9);
  const influences = supports
    .map((support) => {
      const dx = x - support.x;
      const dz = z - support.z;
      return Math.exp(-((dx * dx + dz * dz) / (2 * radius * radius))) * support.intensity;
    })
    .sort((a, b) => b - a);
  const combined =
    (influences[0] ?? 0)
    + (influences[1] ?? 0) * 0.65
    + (influences[2] ?? 0) * 0.35;
  return clamp(combined, 0, 1);
};

const computePlanSupportMetrics = (
  width: number,
  depth: number,
  supports: LocalPlanSupportPoint[]
): PlanSupportMetrics => {
  const halfW = Math.max(width / 2, 0.01);
  const halfD = Math.max(depth / 2, 0.01);
  const corners: Array<[number, number]> = [
    [-halfW, -halfD],
    [halfW, -halfD],
    [-halfW, halfD],
    [halfW, halfD],
  ];
  const cornerScores = corners.map(([x, z]) =>
    getPlanSupportInfluence(x, z, width, depth, supports)
  ) as [number, number, number, number];
  const edgeScores = [
    getPlanSupportInfluence(0, -halfD, width, depth, supports),
    getPlanSupportInfluence(0, halfD, width, depth, supports),
    getPlanSupportInfluence(-halfW, 0, width, depth, supports),
    getPlanSupportInfluence(halfW, 0, width, depth, supports),
  ];
  const centerSupport = getPlanSupportInfluence(0, 0, width, depth, supports);
  return {
    centerSupport,
    edgeSupport: edgeScores.reduce((sum, value) => sum + value, 0) / edgeScores.length,
    cornerSupport: Math.min(...cornerScores),
    averageSupport:
      (centerSupport + edgeScores.reduce((sum, value) => sum + value, 0) + cornerScores.reduce((sum, value) => sum + value, 0))
      / (1 + edgeScores.length + cornerScores.length),
    cornerScores,
  };
};

const buildFloorPatch = (bounds: Bounds3): SupportPatch => ({
  xMin: bounds.minX,
  xMax: bounds.maxX,
  zMin: bounds.minZ,
  zMax: bounds.maxZ,
  area: Math.max((bounds.maxX - bounds.minX) * (bounds.maxZ - bounds.minZ), EPS),
});

const buildRecommendation = (
  overallScore: number,
  connectedGroups: number,
  worst: PartDiagnostics | null,
  weakPartCount: number
) => {
  if (connectedGroups > 1) {
    return 'Separate assemblies are not tied together. Connect load paths before trusting any stress grade.';
  }
  if (!worst) {
    return overallScore >= 0.8
      ? 'No major demand spikes detected under the current assumptions.'
      : 'Model has limited support information. Add clearer bearing surfaces and rerun analysis.';
  }
  if (worst.deflectionRatio > 1.1) {
    return `Serviceability is failing first: shorten unsupported spans or add a support under the worst ${worst.mode}.`;
  }
  if (worst.bendingRatio > 1) {
    return 'Bending demand is too high on at least one member. Increase section depth or reduce span.';
  }
  if (worst.axialRatio > 1) {
    return 'A vertical member is overloaded or too slender. Add bracing or use a larger post section.';
  }
  if (worst.rackRatio > 1) {
    return 'Lateral racking is the weak mode. Add diagonal bracing, shear panels, or tie members together better.';
  }
  if (weakPartCount > 0) {
    return 'Most members are acceptable, but a few highlighted parts still need better support or shorter spans.';
  }
  return 'Current layout looks reasonable for the modeled loads. Check the worst-span metrics before building full scale.';
};

const buildStressRecommendation = (profile: StressProfile, worst: PartDiagnostics | null) => {
  if (!worst) return 'Add wood parts to evaluate load path and member demand.';
  if (profile.id === 'baseline') return worst.recommendation;
  if (profile.id === 'vertical-load') {
    return worst.deflectionRatio >= worst.bendingRatio
      ? 'Vertical-load check is dominated by sag. Add intermediate support or use a deeper member.'
      : 'Vertical-load check is bending-limited. Increase section depth or reduce tributary load.';
  }
  if (profile.id === 'lateral-rack') {
    return 'Use this mode to judge sway, not vertical sag. If the frame grades poorly here, add diagonal bracing or a shear panel.';
  }
  if (profile.id === 'torsion-twist') {
    return 'Twist sensitivity usually means uneven support or off-center loading. Tie corners together and support both sides of wide tops.';
  }
  return 'Impact mode highlights brittle local spans. Spread concentrated loads and avoid long unsupported thin panels.';
};

export const analyzeStructuralIntegrity = (
  parts: PartData[],
  options: StructuralAnalysisOptions = {}
): StructuralReport => {
  const scenario = options.stressScenario ?? 'baseline';
  const stressIntensity = clamp(options.stressIntensity ?? 0.6, 0, 1);
  const profile = STRESS_PROFILES[scenario] ?? STRESS_PROFILES.baseline;

  const woodParts = parts.filter((part) => part.type !== 'hardware');
  const hardwareParts = parts.filter((part) => part.type === 'hardware');
  const fastenerParts = hardwareParts.filter((part) => part.hardwareKind === 'fastener');
  const fastenerCount = fastenerParts.length;

  const emptyReport: StructuralReport = {
    overallScore: 0,
    grade: 'N/A',
    recommendation: 'Add wood parts to run structural analysis.',
    stress: {
      scenario: profile.id,
      label: profile.label,
      description: profile.description,
      intensity: stressIntensity,
      score: 0,
      grade: 'N/A',
      recommendation: 'Add wood parts to run structural analysis.',
    },
    partScores: {},
    partFields: {},
    weakPartIds: [],
    stats: {
      partCount: parts.length,
      woodPartCount: woodParts.length,
      hardwareCount: hardwareParts.length,
      fastenerCount,
      bridgingFasteners: 0,
      fastenerEngagement: 0,
      lumberCount: woodParts.filter((part) => part.type === 'lumber').length,
      sheetCount: woodParts.filter((part) => part.type === 'sheet').length,
      connectedGroups: 0,
      groundedParts: 0,
      averageConnections: 0,
      supportCoverage: 0,
      totalVolumeCuIn: 0,
      totalVolumeCuFt: 0,
      estimatedWeightLb: 0,
      footprintSqFt: 0,
      maxSpanIn: 0,
      modelHeightIn: 0,
      centerOfMassHeightIn: 0,
      symmetryScore: 0,
      worstDeflectionIn: 0,
      worstDeflectionRatio: 0,
      worstBendingRatio: 0,
      worstAxialRatio: 0,
      worstRackRatio: 0,
    },
  };

  if (woodParts.length === 0) return emptyReport;

  const boundsById = new Map<string, Bounds3>();
  const framesById = new Map<string, OrientedFrame>();
  const partVolumeById = new Map<string, number>();
  const partWeightLb = new Map<string, number>();
  const connections = new Map<string, ContactEdge[]>();
  const supportPatches = new Map<string, SupportPatch[]>();
  const supportPoints = new Map<string, StructuralPoint[]>();
  const loadPoints = new Map<string, StructuralPoint[]>();
  const fastenerPoints = new Map<string, StructuralPoint[]>();
  const fastenerLinks = new Map<string, number>();
  const supportArea = new Map<string, number>();
  const aboveLoadLb = new Map<string, number>();
  const verticalSupporters = new Map<string, SupportPatch[]>();

  woodParts.forEach((part) => {
    boundsById.set(part.id, getBounds(part));
    framesById.set(part.id, buildOrientedFrame(part));
    partVolumeById.set(part.id, Math.max(part.dimensions[0] * part.dimensions[1] * part.dimensions[2], EPS));
    partWeightLb.set(part.id, getPartWeightLb(part));
    connections.set(part.id, []);
    supportPatches.set(part.id, []);
    supportPoints.set(part.id, []);
    loadPoints.set(part.id, []);
    fastenerPoints.set(part.id, []);
    fastenerLinks.set(part.id, 0);
    supportArea.set(part.id, 0);
    aboveLoadLb.set(part.id, 0);
    verticalSupporters.set(part.id, []);
  });

  let bridgingFasteners = 0;

  for (let i = 0; i < woodParts.length; i += 1) {
    for (let j = i + 1; j < woodParts.length; j += 1) {
      const partA = woodParts[i];
      const partB = woodParts[j];
      const a = boundsById.get(partA.id);
      const b = boundsById.get(partB.id);
      if (!a || !b) continue;

      const edge = getContactEdge(a, b);
      if (edge) {
        connections.get(partA.id)?.push(edge);
        connections.get(partB.id)?.push(edge);
      }

      const overlapX = overlap(a.minX, a.maxX, b.minX, b.maxX);
      const overlapZ = overlap(a.minZ, a.maxZ, b.minZ, b.maxZ);
      const verticalArea = overlapX * overlapZ;
      if (verticalArea < MIN_CONTACT_AREA) continue;

      const patch: SupportPatch = {
        xMin: Math.max(a.minX, b.minX),
        xMax: Math.min(a.maxX, b.maxX),
        zMin: Math.max(a.minZ, b.minZ),
        zMax: Math.min(a.maxZ, b.maxZ),
        area: verticalArea,
      };

      if (Math.abs(a.minY - b.maxY) <= CONTACT_TOLERANCE) {
        supportPatches.get(partA.id)?.push({ ...patch, belowId: partB.id });
        verticalSupporters.get(partA.id)?.push({ ...patch, belowId: partB.id });
        supportArea.set(partA.id, (supportArea.get(partA.id) ?? 0) + verticalArea);
        pushDistributedPatchPoints(
          supportPoints,
          partA.id,
          patch,
          a.minY,
          clamp(verticalArea / Math.max(partA.dimensions[0] * partA.dimensions[2], EPS), 0.18, 1)
        );
      }

      if (Math.abs(b.minY - a.maxY) <= CONTACT_TOLERANCE) {
        supportPatches.get(partB.id)?.push({ ...patch, belowId: partA.id });
        verticalSupporters.get(partB.id)?.push({ ...patch, belowId: partA.id });
        supportArea.set(partB.id, (supportArea.get(partB.id) ?? 0) + verticalArea);
        pushDistributedPatchPoints(
          supportPoints,
          partB.id,
          patch,
          b.minY,
          clamp(verticalArea / Math.max(partB.dimensions[0] * partB.dimensions[2], EPS), 0.18, 1)
        );
      }
    }
  }

  fastenerParts.forEach((fastener) => {
    const fastenerBounds = getBounds(fastener);
    const touchedWoodIds: string[] = [];

    woodParts.forEach((woodPart) => {
      const woodBounds = boundsById.get(woodPart.id);
      if (!woodBounds) return;
      const ox = overlap(fastenerBounds.minX, fastenerBounds.maxX, woodBounds.minX, woodBounds.maxX);
      const oy = overlap(fastenerBounds.minY, fastenerBounds.maxY, woodBounds.minY, woodBounds.maxY);
      const oz = overlap(fastenerBounds.minZ, fastenerBounds.maxZ, woodBounds.minZ, woodBounds.maxZ);
      if (ox < 0.03 || oy < 0.03 || oz < 0.03) return;
      touchedWoodIds.push(woodPart.id);
    });

    const uniqueTouched = [...new Set(touchedWoodIds)];
    if (uniqueTouched.length >= 2) {
      bridgingFasteners += 1;
      uniqueTouched.forEach((partId) => fastenerLinks.set(partId, (fastenerLinks.get(partId) ?? 0) + 1));
    } else if (uniqueTouched.length === 1) {
      fastenerLinks.set(uniqueTouched[0], (fastenerLinks.get(uniqueTouched[0]) ?? 0) + 0.3);
    }

    uniqueTouched.forEach((partId) => {
      const woodBounds = boundsById.get(partId);
      if (!woodBounds) return;
      fastenerPoints.get(partId)?.push({
        x: midpoint(Math.max(fastenerBounds.minX, woodBounds.minX), Math.min(fastenerBounds.maxX, woodBounds.maxX)),
        y: midpoint(Math.max(fastenerBounds.minY, woodBounds.minY), Math.min(fastenerBounds.maxY, woodBounds.maxY)),
        z: midpoint(Math.max(fastenerBounds.minZ, woodBounds.minZ), Math.min(fastenerBounds.maxZ, woodBounds.maxZ)),
        intensity: uniqueTouched.length >= 2 ? 1 : 0.45,
      });
    });
  });

  const topDownParts = [...woodParts].sort((lhs, rhs) => {
    const a = boundsById.get(lhs.id);
    const b = boundsById.get(rhs.id);
    return (b?.maxY ?? 0) - (a?.maxY ?? 0);
  });

  topDownParts.forEach((part) => {
    const supporters = verticalSupporters.get(part.id) ?? [];
    if (supporters.length === 0) return;
    const totalArea = supporters.reduce((sum, patch) => sum + patch.area, 0);
    if (totalArea <= EPS) return;

    const carried = (aboveLoadLb.get(part.id) ?? 0) + (partWeightLb.get(part.id) ?? 0);
    supporters.forEach((patch) => {
      if (!patch.belowId) return;
      const transferred = carried * (patch.area / totalArea);
      aboveLoadLb.set(patch.belowId, (aboveLoadLb.get(patch.belowId) ?? 0) + transferred);
      const belowBounds = boundsById.get(patch.belowId);
      if (!belowBounds) return;
      pushDistributedPatchPoints(
        loadPoints,
        patch.belowId,
        patch,
        belowBounds.maxY,
        clamp(transferred / Math.max((partWeightLb.get(patch.belowId) ?? 1) * 1.4, 1), 0.12, 1)
      );
    });
  });

  const adjacency = new Map<string, Set<string>>();
  woodParts.forEach((part) => adjacency.set(part.id, new Set()));
  woodParts.forEach((partA, index) => {
    for (let j = index + 1; j < woodParts.length; j += 1) {
      const partB = woodParts[j];
      const a = boundsById.get(partA.id);
      const b = boundsById.get(partB.id);
      if (!a || !b || !getContactEdge(a, b)) continue;
      adjacency.get(partA.id)?.add(partB.id);
      adjacency.get(partB.id)?.add(partA.id);
    }
  });

  let connectedGroups = 0;
  const visited = new Set<string>();
  woodParts.forEach((part) => {
    if (visited.has(part.id)) return;
    connectedGroups += 1;
    const queue = [part.id];
    visited.add(part.id);
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      (adjacency.get(current) ?? new Set()).forEach((neighbor) => {
        if (visited.has(neighbor)) return;
        visited.add(neighbor);
        queue.push(neighbor);
      });
    }
  });

  const allBounds = woodParts.map((part) => boundsById.get(part.id)).filter(Boolean) as Bounds3[];
  const modelMinX = Math.min(...allBounds.map((b) => b.minX));
  const modelMaxX = Math.max(...allBounds.map((b) => b.maxX));
  const modelMinY = Math.min(...allBounds.map((b) => b.minY));
  const modelMaxY = Math.max(...allBounds.map((b) => b.maxY));
  const modelMinZ = Math.min(...allBounds.map((b) => b.minZ));
  const modelMaxZ = Math.max(...allBounds.map((b) => b.maxZ));
  const modelHeightIn = Math.max(modelMaxY - modelMinY, 0);
  const modelCenterX = midpoint(modelMinX, modelMaxX);
  const modelCenterZ = midpoint(modelMinZ, modelMaxZ);

  const partScores: Record<string, number> = {};
  const partFields: Record<string, StructuralPartField> = {};
  const diagnosticsById = new Map<string, PartDiagnostics>();
  const weakPartIds: string[] = [];

  let groundedParts = 0;
  let totalConnections = 0;
  let totalSupportCoverage = 0;
  let worstDeflectionIn = 0;
  let worstDeflectionRatio = 0;
  let worstBendingRatio = 0;
  let worstAxialRatio = 0;
  let worstRackRatio = 0;
  let maxSpanIn = 0;

  woodParts.forEach((part) => {
    const bounds = boundsById.get(part.id);
    const frame = framesById.get(part.id);
    if (!bounds || !frame) return;

    const supportPatchList = [...(supportPatches.get(part.id) ?? [])];
    const footprintArea = Math.max((bounds.maxX - bounds.minX) * (bounds.maxZ - bounds.minZ), EPS);
    const floorGrounded = bounds.minY <= GROUND_TOLERANCE;
    if (floorGrounded) {
      groundedParts += 1;
      const floorPatch = buildFloorPatch(bounds);
      supportPatchList.push(floorPatch);
      pushDistributedPatchPoints(supportPoints, part.id, floorPatch, bounds.minY, 0.55);
    }

    const material = getPartMaterial(part);
    const totalWeight = (partWeightLb.get(part.id) ?? 0) + (aboveLoadLb.get(part.id) ?? 0);
    const planArea = Math.max(part.dimensions[0] * part.dimensions[2], EPS);
    const topExposure = clamp((bounds.maxY - modelMinY) / Math.max(modelHeightIn, 1), 0, 1);
    const horizontality = Math.abs(frame.axes[1].dot(WORLD_UP));
    const verticality = Math.max(
      Math.abs(frame.axes[0].dot(WORLD_UP)),
      Math.abs(frame.axes[1].dot(WORLD_UP)),
      Math.abs(frame.axes[2].dot(WORLD_UP))
    );
    const lateralHeight = Math.max(bounds.maxY - bounds.minY, 0.1);
    const supportCoverage = clamp((supportArea.get(part.id) ?? 0) / footprintArea, 0, 1);
    totalSupportCoverage += supportCoverage;
    const connectionCount = (connections.get(part.id) ?? []).length;
    totalConnections += connectionCount;
    const fastenerSupport = clamp((fastenerLinks.get(part.id) ?? 0) / 3, 0, 1);

    const scenarioVerticalLoad = horizontality >= 0.72
      ? areaLoadToTotalLoad(profile.addedVerticalPsF * stressIntensity, planArea) * clamp(0.45 + topExposure * 0.75, 0.45, 1.2)
      : 0;
    const impactLoad = profile.impactPointLoadLb * stressIntensity * clamp(0.4 + topExposure * 0.6, 0, 1);
    const patchSupportCoords = projectSupportCoords(frame, supportPatchList);
    const supportSamples = [
      ...projectStructuralPointsToPlanLocal(frame, supportPoints.get(part.id) ?? []),
      ...projectStructuralPointsToPlanLocal(frame, fastenerPoints.get(part.id) ?? [], 0.85),
    ];
    const planSupportMetrics = computePlanSupportMetrics(
      part.dimensions[0],
      part.dimensions[2],
      supportSamples
    );
    const supplementalSupportXs = supportSamples.map((point) => point.x);
    const supplementalSupportZs = supportSamples.map((point) => point.z);
    const supportXs = [...patchSupportCoords.supportXs, ...supplementalSupportXs];
    const supportZs = [...patchSupportCoords.supportZs, ...supplementalSupportZs];

    const beamX = estimateBeamSpan(part.dimensions[0], frame.half[0], supportXs);
    const beamZ = estimateBeamSpan(part.dimensions[2], frame.half[2], supportZs);
    const sectionX = calcRectSection(part.dimensions[2], part.dimensions[1]);
    const sectionZ = calcRectSection(part.dimensions[0], part.dimensions[1]);

    const verticalLoadForBending = totalWeight + scenarioVerticalLoad;
    const xDeflection = beamUniformDeflection(verticalLoadForBending, beamX.span, material.modulusPsi, sectionX.inertia, beamX.condition)
      + pointLoadDeflection(impactLoad, beamX.span, material.modulusPsi, sectionX.inertia, beamX.condition);
    const zDeflection = beamUniformDeflection(verticalLoadForBending, beamZ.span, material.modulusPsi, sectionZ.inertia, beamZ.condition)
      + pointLoadDeflection(impactLoad, beamZ.span, material.modulusPsi, sectionZ.inertia, beamZ.condition);
    const xBending = beamUniformBendingStress(verticalLoadForBending, beamX.span, sectionX.sectionModulus, beamX.condition)
      + pointLoadBendingStress(impactLoad, beamX.span, sectionX.sectionModulus, beamX.condition);
    const zBending = beamUniformBendingStress(verticalLoadForBending, beamZ.span, sectionZ.sectionModulus, beamZ.condition)
      + pointLoadBendingStress(impactLoad, beamZ.span, sectionZ.sectionModulus, beamZ.condition);

    const isSheetLike = part.type === 'sheet' || (horizontality >= 0.72 && part.dimensions[1] <= Math.min(part.dimensions[0], part.dimensions[2]) * 0.45);
    const governingAxis: Axis = zDeflection > xDeflection ? 'z' : 'x';
    const governingSpan = governingAxis === 'x' ? beamX.span : beamZ.span;
    const governingDeflection = governingAxis === 'x' ? xDeflection : zDeflection;
    const governingBending = governingAxis === 'x' ? xBending : zBending;
    const governingSupportAdequacy = governingAxis === 'x' ? beamX.adequacy : beamZ.adequacy;
    maxSpanIn = Math.max(maxSpanIn, governingSpan);

    const deflectionLimitDivisor = isSheetLike ? 240 : 360;
    const deflectionLimit = governingSpan > EPS ? governingSpan / deflectionLimitDivisor : 0.01;
    const deflectionRatio = governingSpan > EPS ? governingDeflection / Math.max(deflectionLimit, 0.01) : 0;
    const bendingRatio = governingBending / Math.max(material.bendingAllowPsi, 1);

    const columnAxisIndex = (() => {
      const dots = frame.axes.map((axis) => Math.abs(axis.dot(WORLD_UP)));
      if (dots[0] >= dots[1] && dots[0] >= dots[2]) return 0;
      if (dots[1] >= dots[2]) return 1;
      return 2;
    })();
    const columnLength = part.dimensions[columnAxisIndex as 0 | 1 | 2];
    const crossDims = [part.dimensions[0], part.dimensions[1], part.dimensions[2]].filter((_, idx) => idx !== columnAxisIndex);
    const weakSection = calcRectSection(Math.min(...crossDims), Math.max(...crossDims));
    const axialLoadLb = totalWeight + scenarioVerticalLoad * 0.25;
    const eulerCapacity = (Math.PI * Math.PI * material.modulusPsi * weakSection.inertia) / Math.max(Math.pow(Math.max(columnLength, 0.1), 2), EPS);
    const crushingCapacity = weakSection.area * material.compressionAllowPsi;
    const axialRatio = axialLoadLb / Math.max(Math.min(crushingCapacity, eulerCapacity), 1);
    const centerX = midpoint(bounds.minX, bounds.maxX);
    const centerZ = midpoint(bounds.minZ, bounds.maxZ);
    const radialBias = clamp(Math.hypot(centerX - modelCenterX, centerZ - modelCenterZ) / Math.max(Math.hypot(modelMaxX - modelMinX, modelMaxZ - modelMinZ), 1), 0, 1);
    const panelWidth = Math.max(part.dimensions[0], part.dimensions[2]);
    const isVerticalSheet = part.type === 'sheet' && horizontality <= 0.38 && verticality >= 0.78;
    const shearPanelHelp = isVerticalSheet
      ? clamp(
          connectionCount / 2.8
          + fastenerSupport * 0.95
          + supportCoverage * 0.55
          + clamp(panelWidth / Math.max(lateralHeight, 1), 0.22, 1.1) * 0.35,
          0,
          1
        )
      : 0;
    const braceHelp = clamp(
      connectionCount / 4.5
      + fastenerSupport * 0.35
      + shearPanelHelp * 0.8,
      0,
      1
    );
    const rackDemandBase = profile.lateralFactor * stressIntensity
      * clamp(lateralHeight / Math.max(Math.min(modelMaxX - modelMinX, modelMaxZ - modelMinZ), 12), 0.2, 2.2);
    const rackDemand = isVerticalSheet
      ? rackDemandBase * clamp(0.42 + (1 - shearPanelHelp) * 0.85, 0.18, 1.1)
      : rackDemandBase;
    const torsionDemandBase = profile.torsionFactor * stressIntensity
      * clamp(0.35 + radialBias * 0.9 + topExposure * 0.4, 0.35, 1.8);
    const torsionDemand = isVerticalSheet
      ? torsionDemandBase * clamp(0.3 + (1 - shearPanelHelp) * 0.8, 0.15, 1)
      : torsionDemandBase;
    const rackResistance = clamp(
      governingSupportAdequacy * 0.36 + braceHelp * 0.34 + shearPanelHelp * 0.5,
      0,
      1
    );
    const rackRatio = (rackDemand + torsionDemand) * (1 - rackResistance);

    const looksLikeLedger = horizontality >= 0.72
      && part.type === 'lumber'
      && Math.min(part.dimensions[0], part.dimensions[2]) <= 3
      && connectionCount >= 2
      && (supportCoverage >= 0.12 || fastenerSupport >= 0.35)
      && totalWeight <= (partWeightLb.get(part.id) ?? 0) * 6;
    const horizontalMember = horizontality >= 0.72;
    const cornerSupportDeficit = horizontalMember ? 1 - planSupportMetrics.cornerSupport : 0;
    const centerSupportDeficit = horizontalMember ? 1 - planSupportMetrics.centerSupport : 0;
    const edgeSupportDeficit = horizontalMember ? 1 - planSupportMetrics.edgeSupport : 0;
    const planSupportScore = horizontalMember
      ? clamp(
          planSupportMetrics.cornerSupport * 0.46
          + planSupportMetrics.centerSupport * 0.34
          + planSupportMetrics.edgeSupport * 0.2,
          0,
          1
        )
      : governingSupportAdequacy;
    const mode: PartMode = columnLength >= Math.max(part.dimensions[0], part.dimensions[2]) * 2.8 && verticality >= 0.82
      ? 'column'
      : isVerticalSheet && (connectionCount >= 2 || fastenerSupport >= 0.3 || supportCoverage >= 0.08)
        ? 'shear-panel'
      : isSheetLike
        ? 'panel'
        : looksLikeLedger
          ? 'joint'
          : horizontality >= 0.72
            ? 'beam'
            : connectionCount > 0
              ? 'joint'
              : 'general';

    let risk = 0;
    if (mode === 'column') risk = Math.max(axialRatio, rackRatio * 0.95, deflectionRatio * 0.2);
    else if (mode === 'shear-panel') risk = Math.max(rackRatio * 0.72, bendingRatio * 0.22, axialRatio * 0.22, deflectionRatio * 0.08);
    else if (mode === 'panel') risk = Math.max(
      deflectionRatio * 1.2,
      bendingRatio * 0.95,
      rackRatio * 0.42,
      cornerSupportDeficit * 1.22,
      centerSupportDeficit * 0.9
    );
    else if (mode === 'beam') risk = Math.max(
      deflectionRatio * 0.9,
      bendingRatio,
      rackRatio * 0.4,
      centerSupportDeficit * 0.62,
      edgeSupportDeficit * 0.54
    );
    else if (mode === 'joint') risk = Math.max(bendingRatio * 0.45, axialRatio * 0.4, rackRatio * 0.7, deflectionRatio * 0.18);
    else risk = Math.max(deflectionRatio * 0.55, bendingRatio * 0.55, axialRatio * 0.7, rackRatio);

    if (governingSupportAdequacy < 0.18) {
      risk = Math.max(risk, 1.15 - governingSupportAdequacy * 0.5);
    }

    const score = normalizeRiskToScore(risk);
    partScores[part.id] = score;
    if (score < 0.58) weakPartIds.push(part.id);

    worstDeflectionIn = Math.max(worstDeflectionIn, governingDeflection);
    worstDeflectionRatio = Math.max(worstDeflectionRatio, deflectionRatio);
    worstBendingRatio = Math.max(worstBendingRatio, bendingRatio);
    worstAxialRatio = Math.max(worstAxialRatio, axialRatio);
    worstRackRatio = Math.max(worstRackRatio, rackRatio);

    const recommendation = deflectionRatio >= 1
      ? 'Span is too long for the current section and support spacing.'
      : bendingRatio >= 1
        ? 'Bending stress is above the conservative working limit.'
        : axialRatio >= 1
          ? 'Column/post is overloaded or too slender.'
          : rackRatio >= 1
            ? 'Part depends on weak lateral bracing.'
            : governingSupportAdequacy < 0.4
              ? 'Support spacing is poor even if the member has not failed the limit yet.'
              : 'No major member-level issue detected.';

    diagnosticsById.set(part.id, {
      mode,
      governingAxis,
      supportAdequacy: governingSupportAdequacy,
      deflectionIn: governingDeflection,
      deflectionRatio,
      bendingStressPsi: governingBending,
      bendingRatio,
      axialLoadLb,
      axialRatio,
      rackRatio,
      totalLoadLb: verticalLoadForBending + impactLoad,
      recommendation,
    });

    const partLoadPoints = [...(loadPoints.get(part.id) ?? [])];
    const centerLoadIntensity = mode === 'panel'
      ? clamp(Math.max(deflectionRatio * 1.15, bendingRatio, 0.24 + (1 - governingSupportAdequacy) * 0.28), 0.16, 1)
      : mode === 'shear-panel'
        ? clamp(Math.max(rackRatio * 0.95, 0.12 + (1 - braceHelp) * 0.22), 0.1, 0.85)
      : clamp(Math.max(deflectionRatio, bendingRatio, axialRatio * 0.8, rackRatio * 0.9), 0.12, 1);
    partLoadPoints.push({
      x: midpoint(bounds.minX, bounds.maxX),
      y: mode === 'shear-panel' ? lerp(bounds.minY, bounds.maxY, 0.6) : bounds.maxY,
      z: midpoint(bounds.minZ, bounds.maxZ),
      intensity: centerLoadIntensity,
    });
    if (mode === 'panel') {
      partLoadPoints.push({
        x: bounds.minX,
        y: bounds.maxY,
        z: bounds.minZ,
        intensity: clamp((1 - planSupportMetrics.cornerScores[0]) * 0.95, 0.1, 1),
      });
      partLoadPoints.push({
        x: bounds.maxX,
        y: bounds.maxY,
        z: bounds.minZ,
        intensity: clamp((1 - planSupportMetrics.cornerScores[1]) * 0.95, 0.1, 1),
      });
      partLoadPoints.push({
        x: bounds.minX,
        y: bounds.maxY,
        z: bounds.maxZ,
        intensity: clamp((1 - planSupportMetrics.cornerScores[2]) * 0.95, 0.1, 1),
      });
      partLoadPoints.push({
        x: bounds.maxX,
        y: bounds.maxY,
        z: bounds.maxZ,
        intensity: clamp((1 - planSupportMetrics.cornerScores[3]) * 0.95, 0.1, 1),
      });
      partLoadPoints.push({
        x: lerp(bounds.minX, bounds.maxX, 0.5),
        y: bounds.maxY,
        z: lerp(bounds.minZ, bounds.maxZ, 0.28),
        intensity: clamp(Math.max(centerLoadIntensity * 0.82, centerSupportDeficit * 0.72), 0.14, 1),
      });
      partLoadPoints.push({
        x: lerp(bounds.minX, bounds.maxX, 0.5),
        y: bounds.maxY,
        z: lerp(bounds.minZ, bounds.maxZ, 0.72),
        intensity: clamp(Math.max(centerLoadIntensity * 0.82, centerSupportDeficit * 0.72), 0.14, 1),
      });
    }
    if (mode === 'shear-panel') {
      partLoadPoints.push({
        x: centerX >= modelCenterX ? bounds.maxX : bounds.minX,
        y: lerp(bounds.minY, bounds.maxY, 0.35),
        z: midpoint(bounds.minZ, bounds.maxZ),
        intensity: clamp(centerLoadIntensity * 0.82, 0.1, 0.9),
      });
      partLoadPoints.push({
        x: centerX >= modelCenterX ? bounds.maxX : bounds.minX,
        y: lerp(bounds.minY, bounds.maxY, 0.82),
        z: midpoint(bounds.minZ, bounds.maxZ),
        intensity: clamp(centerLoadIntensity * 0.72, 0.1, 0.85),
      });
    }
    if (profile.torsionFactor > 0 && stressIntensity > 0.01) {
      partLoadPoints.push({
        x: lerp(bounds.minX, bounds.maxX, 0.18),
        y: bounds.maxY,
        z: lerp(bounds.minZ, bounds.maxZ, 0.82),
        intensity: clamp(profile.torsionFactor * stressIntensity * 1.1, 0.1, 1),
      });
      partLoadPoints.push({
        x: lerp(bounds.minX, bounds.maxX, 0.82),
        y: bounds.maxY,
        z: lerp(bounds.minZ, bounds.maxZ, 0.18),
        intensity: clamp(profile.torsionFactor * stressIntensity, 0.1, 1),
      });
    }
    if (profile.lateralFactor > 0 && stressIntensity > 0.01) {
      partLoadPoints.push({
        x: centerX >= modelCenterX ? bounds.maxX : bounds.minX,
        y: lerp(bounds.minY, bounds.maxY, 0.8),
        z: midpoint(bounds.minZ, bounds.maxZ),
        intensity: clamp(profile.lateralFactor * stressIntensity * 1.2, 0.1, 1),
      });
    }

    partFields[part.id] = {
      baseStability: score,
      supportPatternScore: clamp(
        mode === 'panel' || mode === 'beam'
          ? governingSupportAdequacy * 0.58 + planSupportScore * 0.42
          : mode === 'shear-panel'
            ? governingSupportAdequacy * 0.45 + braceHelp * 0.55
            : governingSupportAdequacy,
        0,
        1
      ),
      primarySpanAxis: governingAxis,
      memberMode: mode,
      supportPoints: (supportPoints.get(part.id) ?? []).map((point) => ({ ...point, intensity: clamp(point.intensity, 0.1, 1) })),
      loadPoints: partLoadPoints.map((point) => ({ ...point, intensity: clamp(point.intensity, 0.1, 1) })),
      fastenerPoints: (fastenerPoints.get(part.id) ?? []).map((point) => ({ ...point, intensity: clamp(point.intensity, 0.1, 1) })),
    };
  });

  const totalVolumeCuIn = woodParts.reduce((sum, part) => sum + (partVolumeById.get(part.id) ?? 0), 0);
  const totalVolumeCuFt = totalVolumeCuIn / 1728;
  const estimatedWeightLb = woodParts.reduce((sum, part) => sum + (partWeightLb.get(part.id) ?? 0), 0);
  const footprintSqFt = Math.max((modelMaxX - modelMinX) * (modelMaxZ - modelMinZ), 0) / 144;

  const volumeWeightedCenterY = woodParts.reduce((sum, part) => {
    const volume = partVolumeById.get(part.id) ?? 0;
    const bounds = boundsById.get(part.id);
    if (!bounds) return sum;
    return sum + midpoint(bounds.minY, bounds.maxY) * volume;
  }, 0) / Math.max(totalVolumeCuIn, EPS);
  const centerOfMassHeightIn = Math.max(0, volumeWeightedCenterY - modelMinY);

  let positiveXVolume = 0;
  let negativeXVolume = 0;
  let positiveZVolume = 0;
  let negativeZVolume = 0;
  const symmetryCenterX = midpoint(modelMinX, modelMaxX);
  const symmetryCenterZ = midpoint(modelMinZ, modelMaxZ);
  woodParts.forEach((part) => {
    const volume = partVolumeById.get(part.id) ?? 0;
    const bounds = boundsById.get(part.id);
    if (!bounds) return;
    const cx = midpoint(bounds.minX, bounds.maxX);
    const cz = midpoint(bounds.minZ, bounds.maxZ);
    if (cx >= symmetryCenterX) positiveXVolume += volume; else negativeXVolume += volume;
    if (cz >= symmetryCenterZ) positiveZVolume += volume; else negativeZVolume += volume;
  });
  const symmetryX = 1 - Math.abs(positiveXVolume - negativeXVolume) / Math.max(totalVolumeCuIn, EPS);
  const symmetryZ = 1 - Math.abs(positiveZVolume - negativeZVolume) / Math.max(totalVolumeCuIn, EPS);
  const symmetryScore = clamp((symmetryX + symmetryZ) / 2, 0, 1);

  const weightedScoreDenominator = Math.max(woodParts.reduce((sum, part) => {
    const diag = diagnosticsById.get(part.id);
    const weight = Math.sqrt((partVolumeById.get(part.id) ?? 1) / 10);
    return sum + weight * (diag?.mode === 'panel' || diag?.mode === 'beam' ? 1.15 : 1);
  }, 0), EPS);
  const weightedScore = woodParts.reduce((sum, part) => {
    const diag = diagnosticsById.get(part.id);
    const weight = Math.sqrt((partVolumeById.get(part.id) ?? 1) / 10);
    return sum + (partScores[part.id] ?? 0) * weight * (diag?.mode === 'panel' || diag?.mode === 'beam' ? 1.15 : 1);
  }, 0) / weightedScoreDenominator;

  const supportCoverage = totalSupportCoverage / Math.max(woodParts.length, 1);
  const averageConnections = totalConnections / Math.max(woodParts.length, 1);
  const fastenerEngagement = fastenerCount > 0 ? clamp(bridgingFasteners / fastenerCount, 0, 1) : 0;
  const worstDemand = Math.max(worstDeflectionRatio, worstBendingRatio, worstAxialRatio, worstRackRatio);
  const demandPenalty = clamp((worstDemand - 0.85) * 0.2, 0, 0.3);
  const disconnectedPenalty = connectedGroups > 1 ? Math.min(0.18, (connectedGroups - 1) * 0.07) : 0;
  const overallScore = clamp(
    weightedScore * 0.72
      + supportCoverage * 0.12
      + clamp(averageConnections / 4, 0, 1) * 0.06
      + fastenerEngagement * 0.05
      + symmetryScore * 0.05
      - demandPenalty
      - disconnectedPenalty,
    0,
    1
  );

  let worstDiagnostic: PartDiagnostics | null = null;
  diagnosticsById.forEach((diagnostic) => {
    const severity = Math.max(diagnostic.deflectionRatio, diagnostic.bendingRatio, diagnostic.axialRatio, diagnostic.rackRatio);
    if (!worstDiagnostic || severity > Math.max(worstDiagnostic.deflectionRatio, worstDiagnostic.bendingRatio, worstDiagnostic.axialRatio, worstDiagnostic.rackRatio)) {
      worstDiagnostic = diagnostic;
    }
  });

  const stressPenalty = clamp(
    (profile.id === 'baseline' ? 0 : profile.lateralFactor * 0.12 + profile.torsionFactor * 0.1 + profile.addedVerticalPsF / 1200) * stressIntensity,
    0,
    0.18
  );
  const stressScore = clamp(overallScore - stressPenalty, 0, 1);

  return {
    overallScore,
    grade: getGrade(overallScore),
    recommendation: buildRecommendation(overallScore, connectedGroups, worstDiagnostic, weakPartIds.length),
    stress: {
      scenario: profile.id,
      label: profile.label,
      description: profile.description,
      intensity: stressIntensity,
      score: stressScore,
      grade: getGrade(stressScore),
      recommendation: buildStressRecommendation(profile, worstDiagnostic),
    },
    partScores,
    partFields,
    weakPartIds,
    stats: {
      partCount: parts.length,
      woodPartCount: woodParts.length,
      hardwareCount: hardwareParts.length,
      fastenerCount,
      bridgingFasteners,
      fastenerEngagement,
      lumberCount: woodParts.filter((part) => part.type === 'lumber').length,
      sheetCount: woodParts.filter((part) => part.type === 'sheet').length,
      connectedGroups,
      groundedParts,
      averageConnections,
      supportCoverage,
      totalVolumeCuIn,
      totalVolumeCuFt,
      estimatedWeightLb,
      footprintSqFt,
      maxSpanIn,
      modelHeightIn,
      centerOfMassHeightIn,
      symmetryScore,
      worstDeflectionIn,
      worstDeflectionRatio,
      worstBendingRatio,
      worstAxialRatio,
      worstRackRatio,
    },
  };
};
