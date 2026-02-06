import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Vector3, Euler } from 'three';
import { useStore } from '../store';
import { CutCorner, PartData } from '../types';
import { Plus, Ruler, Box, Move3d, RotateCw, ArrowDownToLine, Layers, Search, Settings2, Hammer, MousePointer2 } from 'lucide-react';
import { clsx } from 'clsx';

const COMMON_PARTS = [
  { name: '2x4 Lumber', dimensions: [1.5, 3.5, 96], type: 'lumber', color: '#eecfa1' },
  { name: '2x6 Lumber', dimensions: [1.5, 5.5, 96], type: 'lumber', color: '#eecfa1' },
  { name: '4x4 Post', dimensions: [3.5, 3.5, 96], type: 'lumber', color: '#d4b483' },
  { name: '1x4 Lumber', dimensions: [0.75, 3.5, 96], type: 'lumber', color: '#f5deb3' },
  { name: 'Plywood 3/4"', dimensions: [48, 0.75, 96], type: 'sheet', color: '#dec49a' },
  { name: 'Plywood 1/2"', dimensions: [48, 0.5, 96], type: 'sheet', color: '#dec49a' },
  { name: 'Nail / Screw', dimensions: [0.1, 2.0, 0.1], type: 'hardware', color: '#a0a0a0' },
] as const;

const L_CUT_CORNERS: { value: CutCorner; label: string }[] = [
  { value: 'front-left', label: 'Front Left' },
  { value: 'front-right', label: 'Front Right' },
  { value: 'back-left', label: 'Back Left' },
  { value: 'back-right', label: 'Back Right' },
];

const clampLCutValue = (value: number, maxValue: number) => {
  const minValue = Math.min(0.125, maxValue / 2);
  const safeMax = Math.max(minValue, maxValue - minValue);
  return Math.max(minValue, Math.min(value, safeMax));
};

const FOOTPRINT_EPS = 0.01;
const ROTATION_EPS = 0.001;

type RectFootprint = {
  id: string;
  xmin: number;
  xmax: number;
  zmin: number;
  zmax: number;
};

const approxEqual = (a: number, b: number, epsilon = FOOTPRINT_EPS) => Math.abs(a - b) <= epsilon;

const toRectFootprint = (part: PartData): RectFootprint => {
  const halfW = part.dimensions[0] / 2;
  const halfD = part.dimensions[2] / 2;
  return {
    id: part.id,
    xmin: part.position[0] - halfW,
    xmax: part.position[0] + halfW,
    zmin: part.position[2] - halfD,
    zmax: part.position[2] + halfD,
  };
};

const touchesOrOverlaps = (a: RectFootprint, b: RectFootprint) => {
  return !(
    a.xmax < b.xmin - FOOTPRINT_EPS
    || b.xmax < a.xmin - FOOTPRINT_EPS
    || a.zmax < b.zmin - FOOTPRINT_EPS
    || b.zmax < a.zmin - FOOTPRINT_EPS
  );
};

const uniqueSorted = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const unique: number[] = [];

  sorted.forEach((value) => {
    if (unique.length === 0 || Math.abs(unique[unique.length - 1] - value) > FOOTPRINT_EPS) {
      unique.push(value);
    }
  });

  return unique;
};

type Point2 = [number, number];
type BoundarySegment = { start: Point2; end: Point2 };

const pointKey = (point: Point2) => `${point[0].toFixed(6)}:${point[1].toFixed(6)}`;

const signedPolygonArea = (points: Point2[]) => {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
};

const simplifyOrthogonalLoop = (points: Point2[]) => {
  if (points.length <= 3) {
    return points;
  }

  let simplified = [...points];
  let changed = true;

  while (changed && simplified.length > 3) {
    changed = false;
    const next: Point2[] = [];

    for (let i = 0; i < simplified.length; i += 1) {
      const prev = simplified[(i - 1 + simplified.length) % simplified.length];
      const curr = simplified[i];
      const nextPoint = simplified[(i + 1) % simplified.length];

      const duplicateOfPrev = approxEqual(curr[0], prev[0]) && approxEqual(curr[1], prev[1]);
      const collinearX = approxEqual(prev[0], curr[0]) && approxEqual(curr[0], nextPoint[0]);
      const collinearZ = approxEqual(prev[1], curr[1]) && approxEqual(curr[1], nextPoint[1]);

      if (duplicateOfPrev || collinearX || collinearZ) {
        changed = true;
        continue;
      }
      next.push(curr);
    }

    simplified = next.length >= 3 ? next : simplified;
  }

  return simplified;
};

const traceUnionBoundary = (xs: number[], zs: number[], coveredMatrix: boolean[][]) => {
  const nx = xs.length - 1;
  const nz = zs.length - 1;
  const segments: BoundarySegment[] = [];

  for (let xi = 0; xi < nx; xi += 1) {
    for (let zi = 0; zi < nz; zi += 1) {
      if (!coveredMatrix[xi][zi]) continue;

      const x0 = xs[xi];
      const x1 = xs[xi + 1];
      const z0 = zs[zi];
      const z1 = zs[zi + 1];

      if (zi === 0 || !coveredMatrix[xi][zi - 1]) {
        segments.push({ start: [x0, z0], end: [x1, z0] });
      }
      if (xi === nx - 1 || !coveredMatrix[xi + 1][zi]) {
        segments.push({ start: [x1, z0], end: [x1, z1] });
      }
      if (zi === nz - 1 || !coveredMatrix[xi][zi + 1]) {
        segments.push({ start: [x1, z1], end: [x0, z1] });
      }
      if (xi === 0 || !coveredMatrix[xi - 1][zi]) {
        segments.push({ start: [x0, z1], end: [x0, z0] });
      }
    }
  }

  if (segments.length === 0) {
    return null;
  }

  const startMap = new Map<string, number[]>();
  segments.forEach((segment, index) => {
    const key = pointKey(segment.start);
    const entries = startMap.get(key) ?? [];
    entries.push(index);
    startMap.set(key, entries);
  });

  const visited = new Set<number>();
  const loops: Point2[][] = [];

  for (let i = 0; i < segments.length; i += 1) {
    if (visited.has(i)) continue;

    const loop: Point2[] = [];
    let currentIndex = i;
    let guard = 0;

    while (!visited.has(currentIndex)) {
      visited.add(currentIndex);
      const segment = segments[currentIndex];
      if (loop.length === 0) {
        loop.push(segment.start);
      }
      loop.push(segment.end);

      const endKey = pointKey(segment.end);
      if (endKey === pointKey(loop[0])) {
        break;
      }

      const nextCandidates = (startMap.get(endKey) ?? []).filter((candidate) => !visited.has(candidate));
      if (nextCandidates.length === 0) {
        return null;
      }

      [currentIndex] = nextCandidates;
      guard += 1;
      if (guard > segments.length + 4) {
        return null;
      }
    }

    if (loop.length >= 4) {
      loop.pop();
      const simplified = simplifyOrthogonalLoop(loop);
      if (simplified.length >= 3) {
        loops.push(simplified);
      }
    }
  }

  if (loops.length === 0) {
    return null;
  }

  const outer = loops.reduce((best, candidate) =>
    Math.abs(signedPolygonArea(candidate)) > Math.abs(signedPolygonArea(best)) ? candidate : best
  );

  if (Math.abs(signedPolygonArea(outer)) <= FOOTPRINT_EPS) {
    return null;
  }

  return signedPolygonArea(outer) < 0 ? [...outer].reverse() : outer;
};

const findAxisIndex = (axis: number[], target: number) => {
  let low = 0;
  let high = axis.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const midValue = axis[mid];
    if (approxEqual(midValue, target)) {
      return mid;
    }
    if (midValue < target) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const fallback = axis.findIndex((value) => approxEqual(value, target));
  return fallback >= 0 ? fallback : null;
};

const analyzeCombinedFootprint = (rects: RectFootprint[]) => {
  if (rects.length === 0) {
    return null;
  }

  const bounds = {
    xmin: Math.min(...rects.map((r) => r.xmin)),
    xmax: Math.max(...rects.map((r) => r.xmax)),
    zmin: Math.min(...rects.map((r) => r.zmin)),
    zmax: Math.max(...rects.map((r) => r.zmax)),
  };

  const xs = uniqueSorted([
    bounds.xmin,
    bounds.xmax,
    ...rects.flatMap((r) => [r.xmin, r.xmax]),
  ]);
  const zs = uniqueSorted([
    bounds.zmin,
    bounds.zmax,
    ...rects.flatMap((r) => [r.zmin, r.zmax]),
  ]);

  type Cell = { x0: number; x1: number; z0: number; z1: number; covered: boolean };
  const nx = xs.length - 1;
  const nz = zs.length - 1;
  const cells: Cell[] = [];
  const coveredMatrix = Array.from({ length: nx }, () =>
    Array.from({ length: nz }, () => false)
  );

  for (const rect of rects) {
    const xiStart = findAxisIndex(xs, rect.xmin);
    const xiEnd = findAxisIndex(xs, rect.xmax);
    const ziStart = findAxisIndex(zs, rect.zmin);
    const ziEnd = findAxisIndex(zs, rect.zmax);

    if (xiStart === null || xiEnd === null || ziStart === null || ziEnd === null) {
      return null;
    }

    for (let xi = xiStart; xi < xiEnd; xi += 1) {
      for (let zi = ziStart; zi < ziEnd; zi += 1) {
        coveredMatrix[xi][zi] = true;
      }
    }
  }

  let unionArea = 0;
  for (let xi = 0; xi < nx; xi += 1) {
    for (let zi = 0; zi < nz; zi += 1) {
      const x0 = xs[xi];
      const x1 = xs[xi + 1];
      const z0 = zs[zi];
      const z1 = zs[zi + 1];
      const area = (x1 - x0) * (z1 - z0);
      if (area <= FOOTPRINT_EPS * FOOTPRINT_EPS) {
        continue;
      }

      const covered = coveredMatrix[xi][zi];
      if (covered) {
        unionArea += area;
      }
      cells.push({ x0, x1, z0, z1, covered });
    }
  }

  const bboxWidth = bounds.xmax - bounds.xmin;
  const bboxDepth = bounds.zmax - bounds.zmin;
  const bboxArea = bboxWidth * bboxDepth;

  if (Math.abs(bboxArea - unionArea) <= FOOTPRINT_EPS) {
    return {
      bounds,
      profile: { type: 'rect' as const },
    };
  }

  const missingCells = cells.filter((cell) => !cell.covered);
  if (missingCells.length === 0) {
    return null;
  }

  const missingBounds = {
    xmin: Math.min(...missingCells.map((cell) => cell.x0)),
    xmax: Math.max(...missingCells.map((cell) => cell.x1)),
    zmin: Math.min(...missingCells.map((cell) => cell.z0)),
    zmax: Math.max(...missingCells.map((cell) => cell.z1)),
  };

  const missingArea = missingCells.reduce((sum, cell) => sum + (cell.x1 - cell.x0) * (cell.z1 - cell.z0), 0);
  const expectedMissingArea = (missingBounds.xmax - missingBounds.xmin) * (missingBounds.zmax - missingBounds.zmin);
  const missingIsAxisAlignedRectangle = Math.abs(missingArea - expectedMissingArea) <= FOOTPRINT_EPS;
  const missingIsContiguousRectangle = missingIsAxisAlignedRectangle && cells.every((cell) => {
    const insideMissing =
      cell.x0 >= missingBounds.xmin - FOOTPRINT_EPS
      && cell.x1 <= missingBounds.xmax + FOOTPRINT_EPS
      && cell.z0 >= missingBounds.zmin - FOOTPRINT_EPS
      && cell.z1 <= missingBounds.zmax + FOOTPRINT_EPS;

    if (insideMissing) {
      return !cell.covered;
    }
    return cell.covered;
  });

  if (missingIsContiguousRectangle) {
    const touchesLeft = approxEqual(missingBounds.xmin, bounds.xmin);
    const touchesRight = approxEqual(missingBounds.xmax, bounds.xmax);
    const touchesBack = approxEqual(missingBounds.zmin, bounds.zmin);
    const touchesFront = approxEqual(missingBounds.zmax, bounds.zmax);

    let corner: CutCorner | null = null;
    if (touchesLeft && touchesFront) corner = 'front-left';
    if (touchesRight && touchesFront) corner = 'front-right';
    if (touchesLeft && touchesBack) corner = 'back-left';
    if (touchesRight && touchesBack) corner = 'back-right';

    if (corner) {
      const cutWidth = missingBounds.xmax - missingBounds.xmin;
      const cutDepth = missingBounds.zmax - missingBounds.zmin;
      if (cutWidth > FOOTPRINT_EPS && cutDepth > FOOTPRINT_EPS) {
        return {
          bounds,
          profile: {
            type: 'l-cut' as const,
            cutWidth,
            cutDepth,
            corner,
          },
        };
      }
    }
  }

  const boundary = traceUnionBoundary(xs, zs, coveredMatrix);
  if (!boundary || boundary.length < 3) {
    return null;
  }

  const centerX = (bounds.xmin + bounds.xmax) / 2;
  const centerZ = (bounds.zmin + bounds.zmax) / 2;
  const localPoints = boundary.map(([x, z]) => [x - centerX, z - centerZ] as [number, number]);

  return {
    bounds,
    profile: {
      type: 'polygon' as const,
      points: localPoints,
    },
  };
};

export const Sidebar: React.FC = () => {
  const { addPart, parts, selectedId, updatePart, setTool, selectPart, setHoveredId, setParts } = useStore();
  const selectedPart = parts.find((p) => p.id === selectedId);
  const [activeTab, setActiveTab] = useState<'library' | 'scene' | 'properties'>('library');
  const [searchTerm, setSearchTerm] = useState('');
  const [combineMessage, setCombineMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (selectedId) {
      setActiveTab('properties');
      setHoveredId(null);
    }
  }, [selectedId, setHoveredId]);

  useEffect(() => {
    setCombineMessage(null);
  }, [selectedId]);

  const handleAddPart = (partTemplate: typeof COMMON_PARTS[number]) => {
    setTool('select');

    const newPart: PartData = {
      id: uuidv4(),
      name: partTemplate.name,
      type: partTemplate.type as PartData['type'],
      dimensions: [...partTemplate.dimensions] as [number, number, number],
      position: [0, partTemplate.dimensions[1] / 2, 0],
      rotation: [0, 0, 0],
      color: partTemplate.color,
      profile: partTemplate.type === 'hardware'
        ? undefined
        : {
            type: 'rect',
          },
    };
    addPart(newPart);
  };

  const updateDimension = (index: number, value: string) => {
    if (!selectedPart) return;
    const val = parseFloat(value);
    if (Number.isNaN(val) || val <= 0) return;

    const newDimensions = [...selectedPart.dimensions] as [number, number, number];
    newDimensions[index] = val;

    if (selectedPart.profile?.type === 'l-cut') {
      const nextProfile = {
        ...selectedPart.profile,
        cutWidth: clampLCutValue(selectedPart.profile.cutWidth ?? newDimensions[0] / 2, newDimensions[0]),
        cutDepth: clampLCutValue(selectedPart.profile.cutDepth ?? newDimensions[2] / 2, newDimensions[2]),
      };
      updatePart(selectedPart.id, { dimensions: newDimensions, profile: nextProfile });
      return;
    }

    if (selectedPart.profile?.type === 'polygon' && selectedPart.profile.points) {
      const widthScale = index === 0 ? (newDimensions[0] / selectedPart.dimensions[0]) : 1;
      const depthScale = index === 2 ? (newDimensions[2] / selectedPart.dimensions[2]) : 1;
      const scaledPoints = selectedPart.profile.points.map(([x, z]) => [
        x * widthScale,
        z * depthScale,
      ] as [number, number]);

      updatePart(selectedPart.id, {
        dimensions: newDimensions,
        profile: {
          type: 'polygon',
          points: scaledPoints,
        },
      });
      return;
    }

    updatePart(selectedPart.id, { dimensions: newDimensions });
  };

  const updatePosition = (index: number, value: string) => {
    if (!selectedPart) return;
    const val = parseFloat(value);
    if (Number.isNaN(val)) return;

    const newPosition = [...selectedPart.position] as [number, number, number];
    newPosition[index] = val;
    updatePart(selectedPart.id, { position: newPosition });
  };

  const toDegrees = (rad: number) => Math.round(rad * (180 / Math.PI));
  const toRadians = (deg: number) => deg * (Math.PI / 180);

  const updateRotation = (index: number, value: string) => {
    if (!selectedPart) return;
    const val = parseFloat(value);
    if (Number.isNaN(val)) return;

    const newRotation = [...selectedPart.rotation] as [number, number, number];
    newRotation[index] = toRadians(val);
    updatePart(selectedPart.id, { rotation: newRotation });
  };

  const rotate90 = (axisIndex: number) => {
    if (!selectedPart) return;
    const newRotation = [...selectedPart.rotation] as [number, number, number];
    newRotation[axisIndex] += Math.PI / 2;
    updatePart(selectedPart.id, { rotation: newRotation });
  };

  const updateProfileType = (profileType: 'rect' | 'l-cut') => {
    if (!selectedPart || selectedPart.type === 'hardware') return;

    if (profileType === 'rect') {
      updatePart(selectedPart.id, { profile: { type: 'rect' } });
      return;
    }

    updatePart(selectedPart.id, {
      profile: {
        type: 'l-cut',
        cutWidth: clampLCutValue(selectedPart.dimensions[0] / 2, selectedPart.dimensions[0]),
        cutDepth: clampLCutValue(selectedPart.dimensions[2] / 2, selectedPart.dimensions[2]),
        corner: 'front-left',
      },
    });
  };

  const updateLCutMeasure = (field: 'cutWidth' | 'cutDepth', value: string) => {
    if (!selectedPart || selectedPart.type === 'hardware') return;
    const numericValue = parseFloat(value);
    if (Number.isNaN(numericValue)) return;

    const max = field === 'cutWidth' ? selectedPart.dimensions[0] : selectedPart.dimensions[2];
    const clamped = clampLCutValue(numericValue, max);

    updatePart(selectedPart.id, {
      profile: {
        type: 'l-cut',
        cutWidth: field === 'cutWidth' ? clamped : clampLCutValue(selectedPart.profile?.cutWidth ?? selectedPart.dimensions[0] / 2, selectedPart.dimensions[0]),
        cutDepth: field === 'cutDepth' ? clamped : clampLCutValue(selectedPart.profile?.cutDepth ?? selectedPart.dimensions[2] / 2, selectedPart.dimensions[2]),
        corner: selectedPart.profile?.corner ?? 'front-left',
      },
    });
  };

  const updateLCutCorner = (corner: CutCorner) => {
    if (!selectedPart || selectedPart.type === 'hardware') return;

    updatePart(selectedPart.id, {
      profile: {
        type: 'l-cut',
        cutWidth: clampLCutValue(selectedPart.profile?.cutWidth ?? selectedPart.dimensions[0] / 2, selectedPart.dimensions[0]),
        cutDepth: clampLCutValue(selectedPart.profile?.cutDepth ?? selectedPart.dimensions[2] / 2, selectedPart.dimensions[2]),
        corner,
      },
    });
  };

  const combineTouchingSheets = () => {
    if (!selectedPart || selectedPart.type !== 'sheet') {
      setCombineMessage({ tone: 'error', text: 'Select a sheet to combine.' });
      return;
    }

    // Merging while transform controls are active can cause expensive rebind work.
    // Force select mode before merge so behavior/perf matches the fast path.
    setTool('select');

    if (selectedPart.profile && selectedPart.profile.type !== 'rect') {
      setCombineMessage({ tone: 'error', text: 'Only rectangular sheets can be merged right now.' });
      return;
    }

    const isUnrotated = selectedPart.rotation.every((r) => Math.abs(r) <= ROTATION_EPS);
    if (!isUnrotated) {
      setCombineMessage({ tone: 'error', text: 'Rotate sheet back to 0 deg before combining.' });
      return;
    }

    const compatibleSheets = parts.filter((part) => {
      if (part.type !== 'sheet') return false;
      if (part.id === selectedPart.id) return false;
      if (part.profile && part.profile.type !== 'rect') return false;

      const sameThickness = approxEqual(part.dimensions[1], selectedPart.dimensions[1], 0.005);
      const sameY = approxEqual(part.position[1], selectedPart.position[1], 0.01);
      const sameRotation = part.rotation.every((rotationValue) => Math.abs(rotationValue) <= ROTATION_EPS);
      return sameThickness && sameY && sameRotation;
    });

    const selectedRect = toRectFootprint(selectedPart);
    const touchingParts = compatibleSheets.filter((part) => {
      const rect = toRectFootprint(part);
      return touchesOrOverlaps(selectedRect, rect);
    });

    if (touchingParts.length === 0) {
      setCombineMessage({ tone: 'error', text: 'No touching or overlapping sheet found to combine.' });
      return;
    }

    const mergeParts = [selectedPart, ...touchingParts];
    const mergeIds = new Set(mergeParts.map((part) => part.id));
    const mergeRects = mergeParts.map((part) => toRectFootprint(part));
    const combined = analyzeCombinedFootprint(mergeRects);

    if (!combined) {
      const detail = touchingParts.length === 1
        ? 'Selected + that one sheet could not be merged cleanly. Check for tiny gaps/rotation mismatch.'
        : `Selected sheet touches ${touchingParts.length} pieces, but this set could not be merged as one clean footprint.`;
      setCombineMessage({
        tone: 'error',
        text: detail,
      });
      return;
    }

    const mergedId = uuidv4();
    const newWidth = combined.bounds.xmax - combined.bounds.xmin;
    const newDepth = combined.bounds.zmax - combined.bounds.zmin;
    const mergedPart: PartData = {
      ...selectedPart,
      id: mergedId,
      dimensions: [newWidth, selectedPart.dimensions[1], newDepth],
      position: [
        (combined.bounds.xmin + combined.bounds.xmax) / 2,
        selectedPart.position[1],
        (combined.bounds.zmin + combined.bounds.zmax) / 2,
      ],
      rotation: [0, 0, 0],
      profile: combined.profile,
    };

    const remainingParts = parts.filter((part) => !mergeIds.has(part.id));
    setParts([...remainingParts, mergedPart]);
    selectPart(mergedId);
    const profileLabel =
      combined.profile.type === 'l-cut'
        ? 'L-cut'
        : combined.profile.type === 'polygon'
          ? 'custom profile'
          : 'rectangular';
    setCombineMessage({
      tone: 'ok',
      text: `Combined ${mergeParts.length} touching sheet piece${mergeParts.length > 1 ? 's' : ''} into one ${profileLabel} part.`,
    });
  };

  const snapToFloor = () => {
    if (!selectedPart) return;

    const { dimensions, rotation } = selectedPart;
    const [w, h, d] = dimensions;
    const [rx, ry, rz] = rotation;

    const corners = [
      new Vector3(w / 2, h / 2, d / 2),
      new Vector3(w / 2, h / 2, -d / 2),
      new Vector3(w / 2, -h / 2, d / 2),
      new Vector3(w / 2, -h / 2, -d / 2),
      new Vector3(-w / 2, h / 2, d / 2),
      new Vector3(-w / 2, h / 2, -d / 2),
      new Vector3(-w / 2, -h / 2, d / 2),
      new Vector3(-w / 2, -h / 2, -d / 2),
    ];

    const euler = new Euler(rx, ry, rz);
    let minY = Infinity;

    corners.forEach((corner) => {
      corner.applyEuler(euler);
      if (corner.y < minY) {
        minY = corner.y;
      }
    });

    updatePart(selectedPart.id, {
      position: [selectedPart.position[0], -minY, selectedPart.position[2]],
    });
  };

  const filteredParts = parts.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const currentProfile = selectedPart?.profile ?? { type: 'rect' as const };
  const profileControlValue = currentProfile.type === 'polygon' ? 'rect' : currentProfile.type;

  return (
    <div className="w-full bg-white border-r border-slate-200 h-full min-h-0 flex flex-col z-10 overflow-hidden">
      <div className="flex border-b border-slate-200 shrink-0">
        <button
          onClick={() => setActiveTab('library')}
          className={clsx(
            'flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors',
            activeTab === 'library'
              ? 'border-blue-500 text-blue-600 bg-blue-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
          )}
        >
          <Hammer size={16} />
          Build
        </button>
        <button
          onClick={() => setActiveTab('scene')}
          className={clsx(
            'flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors',
            activeTab === 'scene'
              ? 'border-blue-500 text-blue-600 bg-blue-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
          )}
        >
          <Layers size={16} />
          Scene
        </button>
        {selectedPart && (
          <button
            onClick={() => setActiveTab('properties')}
            className={clsx(
              'flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors',
              activeTab === 'properties'
                ? 'border-blue-500 text-blue-600 bg-blue-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            )}
          >
            <Settings2 size={16} />
            Edit
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {activeTab === 'library' && (
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
            <div className="pb-2">
              <h2 className="font-semibold text-slate-800">Part Library</h2>
              <p className="text-xs text-slate-500">Select a part to add to the scene</p>
            </div>
            {COMMON_PARTS.map((part) => (
              <button
                key={part.name}
                onClick={() => handleAddPart(part)}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition-all text-left group"
              >
                <div>
                  <div className="font-medium text-slate-700">{part.name}</div>
                  <div className="text-xs text-slate-500">
                    {part.dimensions[0]}" x {part.dimensions[1]}" x {part.dimensions[2]}"
                  </div>
                </div>
                <div className="opacity-0 group-hover:opacity-100 text-blue-500">
                  <Plus size={20} />
                </div>
              </button>
            ))}
          </div>
        )}

        {activeTab === 'scene' && (
          <div className="flex-1 min-h-0 flex flex-col" onMouseLeave={() => setHoveredId(null)}>
            <div className="p-4 border-b border-slate-200 bg-slate-50 shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="Find part..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-2">Hover an item to flash it green in the model.</p>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
              {filteredParts.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">
                  No parts found
                </div>
              ) : (
                filteredParts.map((part) => (
                  <button
                    key={part.id}
                    onClick={() => selectPart(part.id)}
                    onMouseEnter={() => setHoveredId(part.id)}
                    onFocus={() => setHoveredId(part.id)}
                    onBlur={() => setHoveredId(null)}
                    className={clsx(
                      'w-full flex items-center gap-3 p-2 rounded-md text-left text-sm transition-colors',
                      part.id === selectedId
                        ? 'bg-blue-100 text-blue-800 border border-blue-200'
                        : 'hover:bg-slate-100 text-slate-700 border border-transparent'
                    )}
                  >
                    <div className={clsx(
                      'w-8 h-8 rounded flex items-center justify-center shrink-0',
                      part.type === 'hardware' ? 'bg-slate-200 text-slate-500' : 'bg-orange-100 text-orange-600'
                    )}>
                      {part.type === 'hardware' ? (
                        <div className="w-2 h-2 rounded-full bg-current" />
                      ) : (
                        <Box size={14} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{part.name}</div>
                      <div className="text-[10px] text-slate-500 truncate">
                        {part.position.map((n) => Math.round(n)).join(', ')}
                      </div>
                    </div>
                    {part.id === selectedId && <MousePointer2 size={14} className="opacity-50" />}
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'properties' && selectedPart && (
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
            <div className="border-b border-slate-200 pb-4">
              <h2 className="font-semibold text-lg text-slate-800 flex items-center gap-2">
                <Box size={20} />
                Properties
              </h2>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 flex items-center gap-1 mb-1">
                <Ruler size={14} />
                Dimensions (inches)
              </label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-[10px] text-slate-400">Width</span>
                  <input
                    type="number"
                    step="0.1"
                    value={selectedPart.dimensions[0]}
                    onChange={(e) => updateDimension(0, e.target.value)}
                    className="w-full px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400">Height</span>
                  <input
                    type="number"
                    step="0.1"
                    value={selectedPart.dimensions[1]}
                    onChange={(e) => updateDimension(1, e.target.value)}
                    className="w-full px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400">Length</span>
                  <input
                    type="number"
                    step="0.1"
                    value={selectedPart.dimensions[2]}
                    onChange={(e) => updateDimension(2, e.target.value)}
                    className="w-full px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
            </div>

            {selectedPart.type !== 'hardware' && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
                <label className="text-xs font-semibold text-slate-600">Cut Profile</label>
                <select
                  value={profileControlValue}
                  onChange={(e) => updateProfileType(e.target.value as 'rect' | 'l-cut')}
                  className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                >
                  <option value="rect">Rectangle</option>
                  <option value="l-cut">L-Cut (2 straight cuts)</option>
                </select>

                {currentProfile.type === 'polygon' && (
                  <p className="text-[10px] text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                    Custom merged shape. Choose Rectangle or L-cut to replace it with a simpler profile.
                  </p>
                )}

                {currentProfile.type === 'l-cut' && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[10px] text-slate-500">Cut Width</span>
                        <input
                          type="number"
                          step="0.125"
                          value={(currentProfile.cutWidth ?? selectedPart.dimensions[0] / 2).toFixed(3)}
                          onChange={(e) => updateLCutMeasure('cutWidth', e.target.value)}
                          className="w-full px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500">Cut Depth</span>
                        <input
                          type="number"
                          step="0.125"
                          value={(currentProfile.cutDepth ?? selectedPart.dimensions[2] / 2).toFixed(3)}
                          onChange={(e) => updateLCutMeasure('cutDepth', e.target.value)}
                          className="w-full px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                        />
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500">Corner</span>
                      <select
                        value={currentProfile.corner ?? 'front-left'}
                        onChange={(e) => updateLCutCorner(e.target.value as CutCorner)}
                        className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                      >
                        {L_CUT_CORNERS.map((corner) => (
                          <option key={corner.value} value={corner.value}>
                            {corner.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      L-Cut removes one corner rectangle, so all edges remain straight and dimensioned.
                    </p>
                  </>
                )}
              </div>
            )}

            {selectedPart.type === 'sheet' && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                <label className="text-xs font-semibold text-slate-600">Sheet Tools</label>
                <button
                  onClick={combineTouchingSheets}
                  className="w-full py-2 text-xs rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
                >
                  Combine Selected + Touching Sheets
                </button>
                <p className="text-[10px] text-slate-500">
                  Uses the selected sheet and only the sheets directly touching it (same thickness/elevation, 0 degree rotation).
                </p>
                {combineMessage && (
                  <p className={clsx(
                    'text-[11px] rounded px-2 py-1 border',
                    combineMessage.tone === 'ok'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-amber-50 border-amber-200 text-amber-700'
                  )}
                  >
                    {combineMessage.text}
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-500 flex items-center gap-1 mb-1">
                <Move3d size={14} />
                Position (inches)
              </label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-[10px] text-slate-400">X</span>
                  <input
                    type="number"
                    step="0.5"
                    value={selectedPart.position[0].toFixed(2)}
                    onChange={(e) => updatePosition(0, e.target.value)}
                    className="w-full px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400">Y</span>
                  <input
                    type="number"
                    step="0.5"
                    value={selectedPart.position[1].toFixed(2)}
                    onChange={(e) => updatePosition(1, e.target.value)}
                    className="w-full px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400">Z</span>
                  <input
                    type="number"
                    step="0.5"
                    value={selectedPart.position[2].toFixed(2)}
                    onChange={(e) => updatePosition(2, e.target.value)}
                    className="w-full px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
              <button
                onClick={snapToFloor}
                className="w-full mt-2 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded border border-slate-300 transition-colors flex items-center justify-center gap-1.5 font-medium"
                title="Align bottom of part to floor (Y=0)"
              >
                <ArrowDownToLine size={14} />
                Snap to Floor
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 flex items-center gap-1 mb-1">
                <RotateCw size={14} />
                Rotation (degrees)
              </label>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-slate-400">X</span>
                    <button
                      onClick={() => rotate90(0)}
                      className="text-[10px] bg-blue-50 text-blue-600 px-1 rounded hover:bg-blue-100 border border-blue-200"
                      title="Rotate +90 deg"
                    >
                      +90 deg
                    </button>
                  </div>
                  <input
                    type="number"
                    step="45"
                    value={toDegrees(selectedPart.rotation[0])}
                    onChange={(e) => updateRotation(0, e.target.value)}
                    className="w-full px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-slate-400">Y</span>
                    <button
                      onClick={() => rotate90(1)}
                      className="text-[10px] bg-blue-50 text-blue-600 px-1 rounded hover:bg-blue-100 border border-blue-200"
                      title="Rotate +90 deg"
                    >
                      +90 deg
                    </button>
                  </div>
                  <input
                    type="number"
                    step="45"
                    value={toDegrees(selectedPart.rotation[1])}
                    onChange={(e) => updateRotation(1, e.target.value)}
                    className="w-full px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-slate-400">Z</span>
                    <button
                      onClick={() => rotate90(2)}
                      className="text-[10px] bg-blue-50 text-blue-600 px-1 rounded hover:bg-blue-100 border border-blue-200"
                      title="Rotate +90 deg"
                    >
                      +90 deg
                    </button>
                  </div>
                  <input
                    type="number"
                    step="45"
                    value={toDegrees(selectedPart.rotation[2])}
                    onChange={(e) => updateRotation(2, e.target.value)}
                    className="w-full px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-slate-200 bg-slate-50 shrink-0">
        <div className="text-xs text-slate-500">
          <p>Controls:</p>
          <ul className="list-disc list-inside mt-1 space-y-1">
            <li>Left Click to Select</li>
            <li>Right Click to Orbit</li>
            <li>Scroll to Zoom</li>
            <li>Use toolbar to Move/Rotate</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
