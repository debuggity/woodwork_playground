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
  };
};

const EPS = 1e-5;
const CONTACT_TOLERANCE = 0.22;
const MIN_OVERLAP = 0.08;
const MIN_CONTACT_AREA = 0.05;
const GROUND_TOLERANCE = 0.18;

const clamp = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
};

const overlap = (aMin: number, aMax: number, bMin: number, bMax: number) =>
  Math.max(0, Math.min(aMax, bMax) - Math.max(aMin, bMin));

const gap = (aMin: number, aMax: number, bMin: number, bMax: number) =>
  Math.max(0, Math.max(aMin - bMax, bMin - aMax));

const midpoint = (a: number, b: number) => (a + b) / 2;

const hexToRgb = (hex: string): [number, number, number] => {
  const normalized = hex.replace('#', '');
  const full = normalized.length === 3
    ? normalized.split('').map((c) => `${c}${c}`).join('')
    : normalized;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const rgbToHex = (r: number, g: number, b: number) =>
  `#${[r, g, b]
    .map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0'))
    .join('')}`;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type StressProfile = {
  id: StressScenario;
  label: string;
  description: string;
  verticalLoad: number;
  lateralLoad: number;
  torsionLoad: number;
  impactLoad: number;
};

const STRESS_PROFILES: Record<StressScenario, StressProfile> = {
  baseline: {
    id: 'baseline',
    label: 'Baseline',
    description: 'Normal workshop usage with no simulated extreme force.',
    verticalLoad: 0,
    lateralLoad: 0,
    torsionLoad: 0,
    impactLoad: 0,
  },
  'vertical-load': {
    id: 'vertical-load',
    label: 'Vertical Load',
    description: 'Heavy top-down weight to reveal sag and support distribution.',
    verticalLoad: 1,
    lateralLoad: 0.2,
    torsionLoad: 0.1,
    impactLoad: 0,
  },
  'lateral-rack': {
    id: 'lateral-rack',
    label: 'Side Racking',
    description: 'Sideways force to test wobble, bracing, and joint stiffness.',
    verticalLoad: 0.2,
    lateralLoad: 1,
    torsionLoad: 0.35,
    impactLoad: 0.15,
  },
  'torsion-twist': {
    id: 'torsion-twist',
    label: 'Twist Torque',
    description: 'Opposing corner torque to expose torsional weak zones.',
    verticalLoad: 0.3,
    lateralLoad: 0.45,
    torsionLoad: 1,
    impactLoad: 0.1,
  },
  'impact-burst': {
    id: 'impact-burst',
    label: 'Impact Burst',
    description: 'Sudden localized shock load to reveal brittle joints and stress spikes.',
    verticalLoad: 0.4,
    lateralLoad: 0.5,
    torsionLoad: 0.25,
    impactLoad: 1,
  },
};

export const STRESS_SCENARIO_OPTIONS = (
  Object.values(STRESS_PROFILES).map((profile) => ({
    id: profile.id,
    label: profile.label,
    description: profile.description,
  }))
);

const HEAT_STOPS: Array<{ t: number; color: string }> = [
  { t: 0, color: '#dc2626' },
  { t: 0.16, color: '#f97316' },
  { t: 0.34, color: '#facc15' },
  { t: 0.58, color: '#84cc16' },
  { t: 0.78, color: '#10b981' },
  { t: 1, color: '#06b6d4' },
];

const applyHeatContrast = (value: number) => {
  const t = clamp(value, 0, 1);
  if (t < 0.5) {
    return 0.5 * Math.pow(t / 0.5, 1.28);
  }
  return 1 - 0.5 * Math.pow((1 - t) / 0.5, 1.28);
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

const getBounds = (part: PartData): Bounds3 => {
  const [w, h, d] = part.dimensions;
  const halfW = w / 2;
  const halfH = h / 2;
  const halfD = d / 2;

  const sx = Math.sin(part.rotation[0]);
  const cx = Math.cos(part.rotation[0]);
  const sy = Math.sin(part.rotation[1]);
  const cy = Math.cos(part.rotation[1]);
  const sz = Math.sin(part.rotation[2]);
  const cz = Math.cos(part.rotation[2]);

  const rotate = (x: number, y: number, z: number) => {
    let rx = x;
    let ry = y;
    let rz = z;

    const y1 = ry * cx - rz * sx;
    const z1 = ry * sx + rz * cx;
    ry = y1;
    rz = z1;

    const x2 = rx * cy + rz * sy;
    const z2 = -rx * sy + rz * cy;
    rx = x2;
    rz = z2;

    const x3 = rx * cz - ry * sz;
    const y3 = rx * sz + ry * cz;
    rx = x3;
    ry = y3;

    return [rx + part.position[0], ry + part.position[1], rz + part.position[2]] as const;
  };

  const corners = [
    rotate(halfW, halfH, halfD),
    rotate(halfW, halfH, -halfD),
    rotate(halfW, -halfH, halfD),
    rotate(halfW, -halfH, -halfD),
    rotate(-halfW, halfH, halfD),
    rotate(-halfW, halfH, -halfD),
    rotate(-halfW, -halfH, halfD),
    rotate(-halfW, -halfH, -halfD),
  ];

  return {
    minX: Math.min(...corners.map((c) => c[0])),
    maxX: Math.max(...corners.map((c) => c[0])),
    minY: Math.min(...corners.map((c) => c[1])),
    maxY: Math.max(...corners.map((c) => c[1])),
    minZ: Math.min(...corners.map((c) => c[2])),
    maxZ: Math.max(...corners.map((c) => c[2])),
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
  const best = candidates[0];
  return best.area >= MIN_CONTACT_AREA ? best : null;
};

const getGrade = (score: number) => {
  if (score >= 0.9) return 'A+';
  if (score >= 0.82) return 'A';
  if (score >= 0.72) return 'B';
  if (score >= 0.6) return 'C';
  if (score >= 0.45) return 'D';
  return 'F';
};

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const buildRecommendation = (
  overallScore: number,
  weakPartCount: number,
  connectedGroups: number,
  fastenerEngagement: number
) => {
  if (connectedGroups > 1) {
    return 'Multiple disconnected clusters found. Tie assemblies together before load-bearing use.';
  }
  if (fastenerEngagement < 0.35 && overallScore < 0.8) {
    return 'Low fastener engagement detected. Add screws that bridge across joint seams in weak zones.';
  }
  if (weakPartCount >= 3) {
    return 'Several weak zones detected. Add braces and increase overlap where heat map is red/orange.';
  }
  if (weakPartCount > 0) {
    return 'Mostly stable with localized weak zones. Reinforce highlighted pieces for better rigidity.';
  }
  if (overallScore >= 0.86) {
    return 'Strong load path detected. Current design appears well braced for typical workshop use.';
  }
  return 'Moderate stability profile. Additional cross-bracing and fastener spread would improve confidence.';
};

const buildStressRecommendation = (
  profile: StressProfile,
  stressScore: number,
  weakPartCount: number,
  fastenerEngagement: number
) => {
  if (profile.id === 'baseline') {
    return 'Baseline model only. Pick a stress scenario to preview force-specific weak zones.';
  }
  if (stressScore >= 0.82) {
    return `Performs strongly under ${profile.label.toLowerCase()}. Current bracing pattern is handling this load well.`;
  }
  if (stressScore >= 0.65) {
    return `Moderate under ${profile.label.toLowerCase()}. Add a brace near warm zones to improve stiffness.`;
  }
  if (fastenerEngagement < 0.34) {
    return `Weak under ${profile.label.toLowerCase()}. Increase seam-bridging screw count before heavier use.`;
  }
  if (weakPartCount >= 3) {
    return `Several hotspots under ${profile.label.toLowerCase()}. Reinforce red/orange zones first.`;
  }
  return `High-risk behavior under ${profile.label.toLowerCase()}. Add support points and shorten unsupported spans.`;
};

const computeSupportPatternScore = (
  bounds: Bounds3,
  supports: StructuralPoint[],
  grounded: boolean
) => {
  if (supports.length === 0) {
    return grounded ? 0.72 : 0.18;
  }

  const spanX = Math.max(bounds.maxX - bounds.minX, EPS);
  const spanZ = Math.max(bounds.maxZ - bounds.minZ, EPS);
  const footprintDiag = Math.hypot(spanX, spanZ);
  const normalize = Math.max(footprintDiag * 0.46, 0.7);

  const sampleXs = [0.12, 0.32, 0.5, 0.68, 0.88].map((t) => lerp(bounds.minX, bounds.maxX, t));
  const sampleZs = [0.12, 0.32, 0.5, 0.68, 0.88].map((t) => lerp(bounds.minZ, bounds.maxZ, t));

  let weightedDistance = 0;
  let totalWeight = 0;
  sampleXs.forEach((x) => {
    sampleZs.forEach((z) => {
      const nearest = supports.reduce((best, point) => {
        const d = Math.hypot(x - point.x, z - point.z);
        return Math.min(best, d);
      }, Number.POSITIVE_INFINITY);

      const edgeX = Math.min(Math.abs(x - bounds.minX), Math.abs(bounds.maxX - x)) / spanX;
      const edgeZ = Math.min(Math.abs(z - bounds.minZ), Math.abs(bounds.maxZ - z)) / spanZ;
      const centerBias = 1 + (1 - Math.min(edgeX, edgeZ) * 2) * 0.7;
      weightedDistance += nearest * centerBias;
      totalWeight += centerBias;
    });
  });

  const avgDistance = weightedDistance / Math.max(totalWeight, EPS);
  const distribution = clamp(1 - avgDistance / normalize, 0, 1);
  const countBonus = clamp(Math.log2(supports.length + 1) / 3, 0, 1) * 0.22;
  return clamp(distribution + countBonus, 0, 1);
};

const dedupeSortedValues = (values: number[], tolerance = 0.04) => {
  const sorted = [...values].sort((a, b) => a - b);
  const unique: number[] = [];
  sorted.forEach((value) => {
    if (unique.length === 0 || Math.abs(unique[unique.length - 1] - value) > tolerance) {
      unique.push(value);
    }
  });
  return unique;
};

const buildPatchSamples = (min: number, max: number) => {
  const span = Math.max(max - min, 0);
  const center = midpoint(min, max);
  if (span <= 0.12) {
    return [center];
  }
  const inset = Math.min(span * 0.24, 0.7);
  return dedupeSortedValues([min + inset, center, max - inset]);
};

const pushDistributedPatchPoints = (
  target: Map<string, StructuralPoint[]>,
  partId: string,
  patch: { xMin: number; xMax: number; zMin: number; zMax: number },
  y: number,
  baseIntensity: number
) => {
  const xSpan = Math.max(patch.xMax - patch.xMin, 0);
  const zSpan = Math.max(patch.zMax - patch.zMin, 0);
  const xs = buildPatchSamples(patch.xMin, patch.xMax);
  const zs = buildPatchSamples(patch.zMin, patch.zMax);
  const points: Array<{ x: number; z: number; weight: number }> = [];
  const centerX = midpoint(patch.xMin, patch.xMax);
  const centerZ = midpoint(patch.zMin, patch.zMax);
  const halfX = Math.max(xSpan / 2, EPS);
  const halfZ = Math.max(zSpan / 2, EPS);

  xs.forEach((x) => {
    zs.forEach((z) => {
      const radial = Math.hypot((x - centerX) / halfX, (z - centerZ) / halfZ);
      const weight = clamp(1 - radial * 0.22, 0.72, 1);
      points.push({ x, z, weight });
    });
  });

  const list = target.get(partId) ?? [];
  points.forEach((point) => {
    list.push({
      x: point.x,
      y,
      z: point.z,
      intensity: clamp(baseIntensity * point.weight, 0.12, 1),
    });
  });
  target.set(partId, list);
};

export const analyzeStructuralIntegrity = (
  parts: PartData[],
  options: StructuralAnalysisOptions = {}
): StructuralReport => {
  const scenario = options.stressScenario ?? 'baseline';
  const stressIntensity = clamp(options.stressIntensity ?? 0.6, 0, 1);
  const stressProfile = STRESS_PROFILES[scenario] ?? STRESS_PROFILES.baseline;
  const woodParts = parts.filter((part) => part.type !== 'hardware');
  const hardwareParts = parts.filter((part) => part.type === 'hardware');
  const fastenerParts = hardwareParts.filter((part) => part.hardwareKind === 'fastener');
  const fastenerCount = fastenerParts.length;

  const emptyReport: StructuralReport = {
    overallScore: 0,
    grade: 'N/A',
    recommendation: 'Add parts to run structural analysis.',
    stress: {
      scenario: stressProfile.id,
      label: stressProfile.label,
      description: stressProfile.description,
      intensity: stressIntensity,
      score: 0,
      grade: 'N/A',
      recommendation: 'Add parts to run structural stress simulation.',
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
    },
  };

  if (woodParts.length === 0) return emptyReport;

  const boundsById = new Map<string, Bounds3>();
  woodParts.forEach((part) => {
    boundsById.set(part.id, getBounds(part));
  });

  const connections = new Map<string, ContactEdge[]>();
  const supportArea = new Map<string, number>();
  const fastenerLinks = new Map<string, number>();
  const loadDemand = new Map<string, number>();
  const supportPoints = new Map<string, StructuralPoint[]>();
  const loadPoints = new Map<string, StructuralPoint[]>();
  const fastenerPoints = new Map<string, StructuralPoint[]>();
  const verticalSupporters = new Map<string, Array<{
    belowId: string;
    area: number;
    patch: { xMin: number; xMax: number; zMin: number; zMax: number };
  }>>();
  woodParts.forEach((part) => {
    connections.set(part.id, []);
    supportArea.set(part.id, 0);
    fastenerLinks.set(part.id, 0);
    loadDemand.set(part.id, 0);
    supportPoints.set(part.id, []);
    loadPoints.set(part.id, []);
    fastenerPoints.set(part.id, []);
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

      if (Math.abs(a.minY - b.maxY) <= CONTACT_TOLERANCE) {
        supportArea.set(partA.id, (supportArea.get(partA.id) ?? 0) + verticalArea);
        const patch = {
          xMin: Math.max(a.minX, b.minX),
          xMax: Math.min(a.maxX, b.maxX),
          zMin: Math.max(a.minZ, b.minZ),
          zMax: Math.min(a.maxZ, b.maxZ),
        };
        const supportIntensity = clamp(verticalArea / Math.max((partA.dimensions[0] * partA.dimensions[2]), EPS), 0.18, 1);
        pushDistributedPatchPoints(supportPoints, partA.id, patch, a.minY, supportIntensity);
        verticalSupporters.get(partA.id)?.push({
          belowId: partB.id,
          area: verticalArea,
          patch,
        });
      }
      if (Math.abs(b.minY - a.maxY) <= CONTACT_TOLERANCE) {
        supportArea.set(partB.id, (supportArea.get(partB.id) ?? 0) + verticalArea);
        const patch = {
          xMin: Math.max(a.minX, b.minX),
          xMax: Math.min(a.maxX, b.maxX),
          zMin: Math.max(a.minZ, b.minZ),
          zMax: Math.min(a.maxZ, b.maxZ),
        };
        const supportIntensity = clamp(verticalArea / Math.max((partB.dimensions[0] * partB.dimensions[2]), EPS), 0.18, 1);
        pushDistributedPatchPoints(supportPoints, partB.id, patch, b.minY, supportIntensity);
        verticalSupporters.get(partB.id)?.push({
          belowId: partA.id,
          area: verticalArea,
          patch,
        });
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
      uniqueTouched.forEach((partId) => {
        fastenerLinks.set(partId, (fastenerLinks.get(partId) ?? 0) + 1);
        const woodBounds = boundsById.get(partId);
        if (!woodBounds) return;
        const centerX = midpoint(
          Math.max(fastenerBounds.minX, woodBounds.minX),
          Math.min(fastenerBounds.maxX, woodBounds.maxX)
        );
        const centerY = midpoint(
          Math.max(fastenerBounds.minY, woodBounds.minY),
          Math.min(fastenerBounds.maxY, woodBounds.maxY)
        );
        const centerZ = midpoint(
          Math.max(fastenerBounds.minZ, woodBounds.minZ),
          Math.min(fastenerBounds.maxZ, woodBounds.maxZ)
        );
        fastenerPoints.get(partId)?.push({
          x: centerX,
          y: centerY,
          z: centerZ,
          intensity: 1,
        });
      });
      return;
    }
    if (uniqueTouched.length === 1) {
      const partId = uniqueTouched[0];
      fastenerLinks.set(partId, (fastenerLinks.get(partId) ?? 0) + 0.35);
      const woodBounds = boundsById.get(partId);
      if (woodBounds) {
        const centerX = midpoint(
          Math.max(fastenerBounds.minX, woodBounds.minX),
          Math.min(fastenerBounds.maxX, woodBounds.maxX)
        );
        const centerY = midpoint(
          Math.max(fastenerBounds.minY, woodBounds.minY),
          Math.min(fastenerBounds.maxY, woodBounds.maxY)
        );
        const centerZ = midpoint(
          Math.max(fastenerBounds.minZ, woodBounds.minZ),
          Math.min(fastenerBounds.maxZ, woodBounds.maxZ)
        );
        fastenerPoints.get(partId)?.push({
          x: centerX,
          y: centerY,
          z: centerZ,
          intensity: 0.5,
        });
      }
    }
  });

  const partById = new Map<string, PartData>();
  const partVolumeById = new Map<string, number>();
  const carriedLoad = new Map<string, number>();
  woodParts.forEach((part) => {
    partById.set(part.id, part);
    const volume = Math.max(part.dimensions[0] * part.dimensions[1] * part.dimensions[2], EPS);
    partVolumeById.set(part.id, volume);
    carriedLoad.set(part.id, volume);
  });

  const topDownParts = [...woodParts].sort((lhs, rhs) => {
    const a = boundsById.get(lhs.id);
    const b = boundsById.get(rhs.id);
    return (b?.maxY ?? 0) - (a?.maxY ?? 0);
  });

  topDownParts.forEach((part) => {
    const supporters = verticalSupporters.get(part.id) ?? [];
    if (supporters.length === 0) return;
    const totalSupportArea = supporters.reduce((sum, item) => sum + item.area, 0);
    if (totalSupportArea <= EPS) return;

    const carried = carriedLoad.get(part.id) ?? (partVolumeById.get(part.id) ?? EPS);
    supporters.forEach((item) => {
      const share = item.area / totalSupportArea;
      const transferredLoad = carried * share;
      loadDemand.set(item.belowId, (loadDemand.get(item.belowId) ?? 0) + transferredLoad);
      carriedLoad.set(item.belowId, (carriedLoad.get(item.belowId) ?? 0) + transferredLoad);

      const belowPart = partById.get(item.belowId);
      const belowBounds = boundsById.get(item.belowId);
      if (!belowPart || !belowBounds) return;
      const belowVolume = partVolumeById.get(item.belowId) ?? EPS;
      const localIntensity = clamp((transferredLoad / belowVolume) * 0.72, 0.08, 1);
      pushDistributedPatchPoints(
        loadPoints,
        item.belowId,
        item.patch,
        belowBounds.maxY,
        localIntensity
      );
    });
  });

  const adjacency = new Map<string, Set<string>>();
  woodParts.forEach((part) => adjacency.set(part.id, new Set<string>()));
  for (let i = 0; i < woodParts.length; i += 1) {
    for (let j = i + 1; j < woodParts.length; j += 1) {
      const partA = woodParts[i];
      const partB = woodParts[j];
      const a = boundsById.get(partA.id);
      const b = boundsById.get(partB.id);
      if (!a || !b) continue;
      if (!getContactEdge(a, b)) continue;
      adjacency.get(partA.id)?.add(partB.id);
      adjacency.get(partB.id)?.add(partA.id);
    }
  }

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

  const partScores: Record<string, number> = {};
  const partFields: Record<string, StructuralPartField> = {};
  const weakPartIds: string[] = [];

  const allComputedBounds = woodParts
    .map((part) => boundsById.get(part.id))
    .filter(Boolean) as Bounds3[];
  const lowestSupportPlaneY = Math.min(...allComputedBounds.map((bounds) => bounds.minY));
  const modelMinX = Math.min(...allComputedBounds.map((bounds) => bounds.minX));
  const modelMaxX = Math.max(...allComputedBounds.map((bounds) => bounds.maxX));
  const modelMinY = Math.min(...allComputedBounds.map((bounds) => bounds.minY));
  const modelMaxY = Math.max(...allComputedBounds.map((bounds) => bounds.maxY));
  const modelMinZ = Math.min(...allComputedBounds.map((bounds) => bounds.minZ));
  const modelMaxZ = Math.max(...allComputedBounds.map((bounds) => bounds.maxZ));
  const modelCenterX = midpoint(modelMinX, modelMaxX);
  const modelCenterZ = midpoint(modelMinZ, modelMaxZ);
  const modelSpanX = Math.max(modelMaxX - modelMinX, EPS);
  const modelSpanY = Math.max(modelMaxY - modelMinY, EPS);
  const modelSpanZ = Math.max(modelMaxZ - modelMinZ, EPS);
  const modelRadius = Math.max(Math.hypot(modelSpanX * 0.5, modelSpanZ * 0.5), EPS);

  let groundedParts = 0;
  let totalConnections = 0;
  let totalSupportRatio = 0;

  woodParts.forEach((part) => {
    const bounds = boundsById.get(part.id);
    if (!bounds) return;

    const spanX = Math.max(bounds.maxX - bounds.minX, EPS);
    const spanY = Math.max(bounds.maxY - bounds.minY, EPS);
    const spanZ = Math.max(bounds.maxZ - bounds.minZ, EPS);
    const footprintArea = Math.max(spanX * spanZ, EPS);
    const contactList = connections.get(part.id) ?? [];
    totalConnections += contactList.length;

    const floorGrounded = bounds.minY <= GROUND_TOLERANCE;
    const externallySupported = bounds.minY <= lowestSupportPlaneY + 0.22;
    const grounded = floorGrounded || externallySupported;
    if (grounded) groundedParts += 1;

    const rawSupportPoints = supportPoints.get(part.id) ?? [];
    const supportPatternScore = computeSupportPatternScore(bounds, rawSupportPoints, grounded);

    const baseSupport = floorGrounded
      ? footprintArea * clamp((GROUND_TOLERANCE - bounds.minY) / GROUND_TOLERANCE + 0.42, 0.48, 1)
      : externallySupported
        ? footprintArea * 0.58
        : 0;
    const support = Math.min(footprintArea * 1.25, baseSupport + (supportArea.get(part.id) ?? 0));
    const supportRatio = clamp(support / footprintArea, 0, 1);
    totalSupportRatio += supportRatio;

    const totalContactArea = contactList.reduce((sum, edge) => sum + edge.area, 0);
    const connectionScore = clamp(totalContactArea / Math.max(footprintArea * 1.1, EPS), 0, 1);

    const axisSet = new Set<Axis>();
    contactList.forEach((edge) => axisSet.add(edge.axis));
    const axisDiversity = axisSet.size === 0
      ? 0
      : axisSet.size === 1
        ? 0.38
        : axisSet.size === 2
          ? 0.72
          : 1;

    const slenderness = Math.max(spanX, spanY, spanZ) / Math.max(Math.min(spanX, spanZ), 0.5);
    const geometryScore = clamp(1 - (slenderness - 1) / 8, 0.12, 1);

    const relativeHeight = spanY / Math.max(spanX + spanZ, 1);
    const cantileverPenalty = !grounded && supportRatio < 0.36
      ? clamp(relativeHeight * 0.14 + (0.36 - supportRatio) * 0.18, 0, 0.22)
      : 0;
    const screwSupport = clamp((fastenerLinks.get(part.id) ?? 0) / 2.5, 0, 1);
    const ownVolume = Math.max(spanX * spanY * spanZ, EPS);
    const loadRatio = clamp((loadDemand.get(part.id) ?? 0) / ownVolume, 0, 5);
    const pressurePenalty = clamp((loadRatio - 1.05) * 0.045, 0, 0.14) * (1 - supportRatio * 0.68);

    let score = (
      supportRatio * 0.3
      + supportPatternScore * 0.16
      + connectionScore * 0.18
      + axisDiversity * 0.1
      + geometryScore * 0.1
      + screwSupport * 0.14
      + (grounded ? 0.09 : 0)
      - cantileverPenalty
      - pressurePenalty
    );

    if (!grounded && contactList.length === 0 && screwSupport < 0.2) {
      score -= 0.22;
    }

    const centerX = midpoint(bounds.minX, bounds.maxX);
    const centerZ = midpoint(bounds.minZ, bounds.maxZ);
    const radialNorm = clamp(
      Math.hypot(centerX - modelCenterX, centerZ - modelCenterZ) / modelRadius,
      0,
      1
    );
    const topExposure = clamp((bounds.maxY - modelMinY) / modelSpanY, 0, 1);
    const scenarioWeight = stressProfile.id === 'baseline'
      ? 0
      : clamp(0.4 + stressIntensity * 0.6, 0.4, 1);

    const verticalPenalty = stressProfile.verticalLoad
      * scenarioWeight
      * (0.13 + loadRatio * 0.05)
      * (1 - supportRatio * 0.72);
    const lateralPenalty = stressProfile.lateralLoad
      * scenarioWeight
      * (0.12 + relativeHeight * 0.08 + topExposure * 0.05)
      * (1 - (axisDiversity * 0.5 + screwSupport * 0.26 + connectionScore * 0.24));
    const torsionPenalty = stressProfile.torsionLoad
      * scenarioWeight
      * (0.1 + radialNorm * 0.1 + topExposure * 0.06)
      * (1 - (supportPatternScore * 0.46 + screwSupport * 0.34 + axisDiversity * 0.2));
    const impactPenalty = stressProfile.impactLoad
      * scenarioWeight
      * (0.08 + loadRatio * 0.05)
      * (1 - (screwSupport * 0.42 + connectionScore * 0.34 + supportRatio * 0.24));
    const stressPenalty = clamp(
      verticalPenalty + lateralPenalty + torsionPenalty + impactPenalty,
      0,
      0.56
    );
    const resilience = clamp(
      supportRatio * 0.36
      + supportPatternScore * 0.25
      + screwSupport * 0.2
      + axisDiversity * 0.19,
      0,
      1
    );
    const stressBonus = stressProfile.id === 'baseline'
      ? 0
      : Math.max(0, resilience - 0.62) * scenarioWeight * 0.08;
    score = score - stressPenalty + stressBonus;

    score = clamp(score, 0, 1);
    partScores[part.id] = score;

    if (score < 0.48) {
      weakPartIds.push(part.id);
    }

    const spanAxis: Axis = spanX >= spanZ ? 'x' : 'z';
    const supportList = [...(supportPoints.get(part.id) ?? [])];
    if (grounded && supportList.length === 0) {
      supportList.push({
        x: midpoint(bounds.minX, bounds.maxX),
        y: bounds.minY,
        z: midpoint(bounds.minZ, bounds.maxZ),
        intensity: 0.5,
      });
    }

    const scenarioLoadList: StructuralPoint[] = [];
    if (stressProfile.id !== 'baseline') {
      const heightBias = clamp(0.62 + topExposure * 0.52, 0.62, 1.25);
      if (stressProfile.verticalLoad > 0) {
        const vIntensity = clamp(
          0.24 + stressProfile.verticalLoad * stressIntensity * heightBias * 0.62,
          0.12,
          1
        );
        scenarioLoadList.push({
          x: midpoint(bounds.minX, bounds.maxX),
          y: bounds.maxY,
          z: midpoint(bounds.minZ, bounds.maxZ),
          intensity: vIntensity,
        });
        scenarioLoadList.push({
          x: lerp(bounds.minX, bounds.maxX, 0.22),
          y: bounds.maxY,
          z: lerp(bounds.minZ, bounds.maxZ, 0.22),
          intensity: clamp(vIntensity * 0.7, 0.1, 1),
        });
        scenarioLoadList.push({
          x: lerp(bounds.minX, bounds.maxX, 0.78),
          y: bounds.maxY,
          z: lerp(bounds.minZ, bounds.maxZ, 0.78),
          intensity: clamp(vIntensity * 0.7, 0.1, 1),
        });
      }
      if (stressProfile.lateralLoad > 0) {
        const sidePushX = modelCenterX <= centerX ? bounds.maxX : bounds.minX;
        const lIntensity = clamp(
          0.2 + stressProfile.lateralLoad * stressIntensity * heightBias * 0.58,
          0.1,
          1
        );
        scenarioLoadList.push({
          x: sidePushX,
          y: lerp(bounds.minY, bounds.maxY, 0.8),
          z: midpoint(bounds.minZ, bounds.maxZ),
          intensity: lIntensity,
        });
        scenarioLoadList.push({
          x: sidePushX,
          y: lerp(bounds.minY, bounds.maxY, 0.56),
          z: lerp(bounds.minZ, bounds.maxZ, 0.32),
          intensity: clamp(lIntensity * 0.75, 0.1, 1),
        });
      }
      if (stressProfile.torsionLoad > 0) {
        const tIntensity = clamp(
          0.2 + stressProfile.torsionLoad * stressIntensity * (0.55 + radialNorm * 0.55),
          0.1,
          1
        );
        scenarioLoadList.push({
          x: bounds.minX,
          y: bounds.maxY,
          z: bounds.maxZ,
          intensity: tIntensity,
        });
        scenarioLoadList.push({
          x: bounds.maxX,
          y: bounds.maxY,
          z: bounds.minZ,
          intensity: clamp(tIntensity * 0.9, 0.1, 1),
        });
      }
      if (stressProfile.impactLoad > 0) {
        const seed = hashString(part.id);
        const tx = 0.18 + ((seed % 100) / 100) * 0.64;
        const tz = 0.18 + (((seed >> 7) % 100) / 100) * 0.64;
        const impactX = lerp(bounds.minX, bounds.maxX, tx);
        const impactZ = lerp(bounds.minZ, bounds.maxZ, tz);
        const iIntensity = clamp(
          0.28 + stressProfile.impactLoad * stressIntensity * 0.72,
          0.1,
          1
        );
        scenarioLoadList.push({
          x: impactX,
          y: lerp(bounds.minY, bounds.maxY, 0.86),
          z: impactZ,
          intensity: iIntensity,
        });
        scenarioLoadList.push({
          x: lerp(bounds.minX, bounds.maxX, clamp(tx + 0.14, 0.08, 0.92)),
          y: lerp(bounds.minY, bounds.maxY, 0.68),
          z: lerp(bounds.minZ, bounds.maxZ, clamp(tz - 0.12, 0.08, 0.92)),
          intensity: clamp(iIntensity * 0.62, 0.1, 1),
        });
      }
    }
    const mergedLoadPoints = [
      ...(loadPoints.get(part.id) ?? []),
      ...scenarioLoadList,
    ];

    partFields[part.id] = {
      baseStability: score,
      supportPatternScore,
      primarySpanAxis: spanAxis,
      supportPoints: supportList.map((point) => ({
        ...point,
        intensity: clamp(point.intensity, 0.1, 1),
      })),
      loadPoints: mergedLoadPoints.map((point) => ({
        ...point,
        intensity: clamp(point.intensity, 0.1, 1),
      })),
      fastenerPoints: (fastenerPoints.get(part.id) ?? []).map((point) => ({
        ...point,
        intensity: clamp(point.intensity, 0.1, 1),
      })),
    };
  });

  const totalVolumeCuIn = woodParts.reduce(
    (sum, part) => sum + part.dimensions[0] * part.dimensions[1] * part.dimensions[2],
    0
  );
  const totalVolumeCuFt = totalVolumeCuIn / 1728;
  const estimatedWeightLb = totalVolumeCuFt * 34;

  const allBounds = woodParts.map((part) => boundsById.get(part.id)).filter(Boolean) as Bounds3[];
  const minX = Math.min(...allBounds.map((b) => b.minX));
  const maxX = Math.max(...allBounds.map((b) => b.maxX));
  const minY = Math.min(...allBounds.map((b) => b.minY));
  const maxY = Math.max(...allBounds.map((b) => b.maxY));
  const minZ = Math.min(...allBounds.map((b) => b.minZ));
  const maxZ = Math.max(...allBounds.map((b) => b.maxZ));
  const modelHeightIn = Math.max(maxY - minY, 0);
  const footprintSqFt = Math.max((maxX - minX) * (maxZ - minZ), 0) / 144;
  const maxSpanIn = Math.max(maxX - minX, maxZ - minZ);

  const volumeWeightedCenterY = woodParts.reduce((sum, part) => {
    const volume = part.dimensions[0] * part.dimensions[1] * part.dimensions[2];
    const bounds = boundsById.get(part.id);
    if (!bounds) return sum;
    return sum + ((bounds.minY + bounds.maxY) / 2) * volume;
  }, 0) / Math.max(totalVolumeCuIn, EPS);
  const centerOfMassHeightIn = Math.max(0, volumeWeightedCenterY - minY);

  let positiveXVolume = 0;
  let negativeXVolume = 0;
  let positiveZVolume = 0;
  let negativeZVolume = 0;
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  woodParts.forEach((part) => {
    const volume = part.dimensions[0] * part.dimensions[1] * part.dimensions[2];
    const bounds = boundsById.get(part.id);
    if (!bounds) return;
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;
    if (cx >= centerX) positiveXVolume += volume; else negativeXVolume += volume;
    if (cz >= centerZ) positiveZVolume += volume; else negativeZVolume += volume;
  });
  const symmetryX = 1 - Math.abs(positiveXVolume - negativeXVolume) / Math.max(totalVolumeCuIn, EPS);
  const symmetryZ = 1 - Math.abs(positiveZVolume - negativeZVolume) / Math.max(totalVolumeCuIn, EPS);
  const symmetryScore = clamp((symmetryX + symmetryZ) / 2, 0, 1);

  const volumeWeightedScore = woodParts.reduce((sum, part) => {
    const volume = part.dimensions[0] * part.dimensions[1] * part.dimensions[2];
    const weight = Math.sqrt(Math.max(volume, EPS));
    return sum + (partScores[part.id] ?? 0) * weight;
  }, 0) / woodParts.reduce((sum, part) => {
    const volume = part.dimensions[0] * part.dimensions[1] * part.dimensions[2];
    return sum + Math.sqrt(Math.max(volume, EPS));
  }, 0);

  const supportCoverage = totalSupportRatio / Math.max(woodParts.length, 1);
  const averageConnections = totalConnections / Math.max(woodParts.length, 1);
  const weakRatio = weakPartIds.length / Math.max(woodParts.length, 1);
  const topHeavyRatio = centerOfMassHeightIn / Math.max(modelHeightIn, 1);

  const componentPenalty = connectedGroups > 1
    ? Math.min(0.18, 0.06 * (connectedGroups - 1))
    : 0;
  const weakPenalty = weakRatio * 0.12;
  const topHeavyPenalty = clamp(topHeavyRatio - 0.7, 0, 0.4) * 0.28;

  const rawScore = (
    volumeWeightedScore * 0.62
    + supportCoverage * 0.14
    + clamp(averageConnections / 3.6, 0, 1) * 0.11
    + symmetryScore * 0.08
    + clamp(groundedParts / Math.max(woodParts.length, 1), 0, 1) * 0.05
    + (fastenerCount > 0 ? clamp(bridgingFasteners / Math.max(fastenerCount, 1), 0, 1) * 0.06 : 0)
  );

  const penalized = clamp(rawScore - componentPenalty - weakPenalty - topHeavyPenalty, 0, 1);
  const overallScore = clamp(0.08 + penalized * 0.92, 0, 1);
  const grade = getGrade(overallScore);
  const fastenerEngagement = fastenerCount > 0 ? clamp(bridgingFasteners / fastenerCount, 0, 1) : 0;
  const stressScore = overallScore;

  return {
    overallScore,
    grade,
    recommendation: buildRecommendation(overallScore, weakPartIds.length, connectedGroups, fastenerEngagement),
    stress: {
      scenario: stressProfile.id,
      label: stressProfile.label,
      description: stressProfile.description,
      intensity: stressIntensity,
      score: stressScore,
      grade: getGrade(stressScore),
      recommendation: buildStressRecommendation(
        stressProfile,
        stressScore,
        weakPartIds.length,
        fastenerEngagement
      ),
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
    },
  };
};
