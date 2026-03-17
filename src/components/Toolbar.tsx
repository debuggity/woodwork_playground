import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { MousePointer2, Move, RotateCw, Trash2, RotateCcw, Copy, Magnet, Download, Upload, Grid, ChevronDown, ChevronUp, LocateFixed, Wrench, Check, Hammer, X, Scissors, Undo2, Redo2, Sun, Cpu, Shield, ActivitySquare, Gauge, Layers, Maximize2, ArrowDown, MoveHorizontal, Zap, Ruler } from 'lucide-react';
import { CutCorner, PartData } from '../types';
import * as THREE from 'three';
import polygonClipping from 'polygon-clipping';
import { analyzeStructuralIntegrity, STRESS_SCENARIO_OPTIONS } from '../structuralAnalysis';
import type { StressScenario } from '../structuralAnalysis';
import { formatArea, formatLengthWithUnit, formatWeight } from '../utils/units';

const sanitizeFilename = (value: string) => {
  const trimmed = value.trim();
  const safe = trimmed.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-');
  const normalized = safe || 'wood-design';
  return normalized.endsWith('.json') ? normalized : `${normalized}.json`;
};

type Point2 = [number, number];
type FootprintBounds = { xmin: number; xmax: number; zmin: number; zmax: number };
type BoundarySegment = { start: Point2; end: Point2 };
type Cell = { x0: number; x1: number; z0: number; z1: number; covered: boolean; insideSelected: boolean };
type FootprintPolygon = { points: Point2[]; bounds: FootprintBounds };
type AxisAlignedBounds3 = {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
  zmin: number;
  zmax: number;
};
type OrientedFrame = {
  center: THREE.Vector3;
  half: [number, number, number];
  axes: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
};

const OVERLAP_EPS = 0.01;

const approxEqual = (a: number, b: number, epsilon = OVERLAP_EPS) => Math.abs(a - b) <= epsilon;

const clampCutValue = (value: number, maxValue: number) => {
  const minValue = Math.min(0.125, maxValue / 2);
  const safeMax = Math.max(minValue, maxValue - minValue);
  return Math.max(minValue, Math.min(value, safeMax));
};

const getLCutPoints = (
  width: number,
  depth: number,
  cutWidth: number,
  cutDepth: number,
  corner: CutCorner
): Point2[] => {
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

const getLocalFootprintPoints = (part: PartData): Point2[] => {
  const width = part.dimensions[0];
  const depth = part.dimensions[2];

  if (part.profile?.type === 'polygon' && part.profile.points && part.profile.points.length >= 3) {
    return part.profile.points;
  }

  if (part.profile?.type === 'l-cut') {
    const cutWidth = clampCutValue(part.profile.cutWidth ?? width / 2, width);
    const cutDepth = clampCutValue(part.profile.cutDepth ?? depth / 2, depth);
    const corner = part.profile.corner ?? 'front-left';
    return getLCutPoints(width, depth, cutWidth, cutDepth, corner);
  }

  const minX = -width / 2;
  const maxX = width / 2;
  const minZ = -depth / 2;
  const maxZ = depth / 2;
  return [
    [minX, minZ],
    [maxX, minZ],
    [maxX, maxZ],
    [minX, maxZ],
  ];
};

const getLocalFootprintBounds = (points: Point2[]): FootprintBounds => ({
  xmin: Math.min(...points.map(([x]) => x)),
  xmax: Math.max(...points.map(([x]) => x)),
  zmin: Math.min(...points.map(([, z]) => z)),
  zmax: Math.max(...points.map(([, z]) => z)),
});

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

const intersectLineWithFrame = (
  frame: OrientedFrame,
  linePoint: THREE.Vector3,
  lineDir: THREE.Vector3,
  tolerance = OVERLAP_EPS
) => {
  const localPoint = toFrameLocal(frame, linePoint);
  const localDir = new THREE.Vector3(
    lineDir.dot(frame.axes[0]),
    lineDir.dot(frame.axes[1]),
    lineDir.dot(frame.axes[2])
  );

  let tMin = -Infinity;
  let tMax = Infinity;
  const half = frame.half;

  const pArr = [localPoint.x, localPoint.y, localPoint.z] as const;
  const dArr = [localDir.x, localDir.y, localDir.z] as const;
  for (let axis = 0; axis < 3; axis += 1) {
    const p = pArr[axis];
    const d = dArr[axis];
    const h = half[axis] + tolerance;

    if (Math.abs(d) < 1e-6) {
      if (Math.abs(p) > h) return null;
      continue;
    }

    const t1 = (-h - p) / d;
    const t2 = (h - p) / d;
    const enter = Math.min(t1, t2);
    const exit = Math.max(t1, t2);
    tMin = Math.max(tMin, enter);
    tMax = Math.min(tMax, exit);
    if (tMin > tMax) return null;
  }

  return { start: tMin, end: tMax };
};

const getWorldCorners = (frame: OrientedFrame) => {
  const [hx, hy, hz] = frame.half;
  const corners: THREE.Vector3[] = [];
  const signs = [-1, 1];
  for (const sx of signs) {
    for (const sy of signs) {
      for (const sz of signs) {
        const corner = frame.center.clone()
          .add(frame.axes[0].clone().multiplyScalar(sx * hx))
          .add(frame.axes[1].clone().multiplyScalar(sy * hy))
          .add(frame.axes[2].clone().multiplyScalar(sz * hz));
        corners.push(corner);
      }
    }
  }
  return corners;
};

const getFrameAabb = (frame: OrientedFrame): AxisAlignedBounds3 => {
  const corners = getWorldCorners(frame);
  return {
    xmin: Math.min(...corners.map((c) => c.x)),
    xmax: Math.max(...corners.map((c) => c.x)),
    ymin: Math.min(...corners.map((c) => c.y)),
    ymax: Math.max(...corners.map((c) => c.y)),
    zmin: Math.min(...corners.map((c) => c.z)),
    zmax: Math.max(...corners.map((c) => c.z)),
  };
};

const aabb3Overlaps = (a: AxisAlignedBounds3, b: AxisAlignedBounds3) => !(
  a.xmax < b.xmin - OVERLAP_EPS
  || b.xmax < a.xmin - OVERLAP_EPS
  || a.ymax < b.ymin - OVERLAP_EPS
  || b.ymax < a.ymin - OVERLAP_EPS
  || a.zmax < b.zmin - OVERLAP_EPS
  || b.zmax < a.zmin - OVERLAP_EPS
);

const isPointOnSegment = (point: Point2, start: Point2, end: Point2) => {
  const [px, pz] = point;
  const [x1, z1] = start;
  const [x2, z2] = end;
  const cross = (px - x1) * (z2 - z1) - (pz - z1) * (x2 - x1);
  if (Math.abs(cross) > OVERLAP_EPS) return false;
  const dot = (px - x1) * (px - x2) + (pz - z1) * (pz - z2);
  return dot <= OVERLAP_EPS;
};

const pointInPolygonOrOnEdge = (x: number, z: number, points: Point2[]) => {
  let inside = false;
  const testPoint: Point2 = [x, z];
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i];
    const b = points[j];
    if (isPointOnSegment(testPoint, a, b)) return true;

    const xi = a[0];
    const zi = a[1];
    const xj = b[0];
    const zj = b[1];
    const intersects = ((zi > z) !== (zj > z))
      && (x < ((xj - xi) * (z - zi)) / ((zj - zi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
};

const uniqueSorted = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const unique: number[] = [];
  sorted.forEach((value) => {
    if (unique.length === 0 || Math.abs(unique[unique.length - 1] - value) > OVERLAP_EPS) {
      unique.push(value);
    }
  });
  return unique;
};

const snapAxisToBounds = (value: number, min: number, max: number, tolerance: number) => {
  if (Math.abs(value - min) <= tolerance) return min;
  if (Math.abs(value - max) <= tolerance) return max;
  return clampNumber(value, min, max);
};

const clampBoundaryToBounds = (points: Point2[], bounds: FootprintBounds, tolerance: number) =>
  points.map(([x, z]) => ([
    snapAxisToBounds(x, bounds.xmin, bounds.xmax, tolerance),
    snapAxisToBounds(z, bounds.zmin, bounds.zmax, tolerance),
  ] as Point2));

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
  if (points.length <= 3) return points;
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

      if (zi === 0 || !coveredMatrix[xi][zi - 1]) segments.push({ start: [x0, z0], end: [x1, z0] });
      if (xi === nx - 1 || !coveredMatrix[xi + 1][zi]) segments.push({ start: [x1, z0], end: [x1, z1] });
      if (zi === nz - 1 || !coveredMatrix[xi][zi + 1]) segments.push({ start: [x1, z1], end: [x0, z1] });
      if (xi === 0 || !coveredMatrix[xi - 1][zi]) segments.push({ start: [x0, z1], end: [x0, z0] });
    }
  }

  if (segments.length === 0) return null;

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
      if (loop.length === 0) loop.push(segment.start);
      loop.push(segment.end);

      const endKey = pointKey(segment.end);
      if (endKey === pointKey(loop[0])) break;

      const nextCandidates = (startMap.get(endKey) ?? []).filter((candidate) => !visited.has(candidate));
      if (nextCandidates.length === 0) return null;
      [currentIndex] = nextCandidates;
      guard += 1;
      if (guard > segments.length + 4) return null;
    }

    if (loop.length >= 4) {
      loop.pop();
      const simplified = simplifyOrthogonalLoop(loop);
      if (simplified.length >= 3) loops.push(simplified);
    }
  }

  if (loops.length !== 1) return null;
  const outer = loops[0];
  const area = signedPolygonArea(outer);
  if (Math.abs(area) <= OVERLAP_EPS) return null;
  return area < 0 ? [...outer].reverse() : outer;
};

const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const simplifyPolygonLoop = (points: Point2[], epsilon = 0.01) => {
  if (points.length <= 3) return points;

  const deduped: Point2[] = [];
  points.forEach((point) => {
    const prev = deduped[deduped.length - 1];
    if (!prev || Math.hypot(point[0] - prev[0], point[1] - prev[1]) > epsilon) {
      deduped.push(point);
    }
  });
  if (deduped.length > 2) {
    const first = deduped[0];
    const last = deduped[deduped.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= epsilon) {
      deduped.pop();
    }
  }

  let simplified = deduped;
  let changed = true;
  while (changed && simplified.length > 3) {
    changed = false;
    const next: Point2[] = [];
    for (let i = 0; i < simplified.length; i += 1) {
      const prev = simplified[(i - 1 + simplified.length) % simplified.length];
      const curr = simplified[i];
      const after = simplified[(i + 1) % simplified.length];
      const v1x = curr[0] - prev[0];
      const v1z = curr[1] - prev[1];
      const v2x = after[0] - curr[0];
      const v2z = after[1] - curr[1];
      const cross = Math.abs(v1x * v2z - v1z * v2x);
      const scale = Math.hypot(v1x, v1z) + Math.hypot(v2x, v2z);
      if (cross <= epsilon * Math.max(1, scale)) {
        changed = true;
        continue;
      }
      next.push(curr);
    }
    if (next.length >= 3) {
      simplified = next;
    } else {
      break;
    }
  }

  return simplified;
};

const distancePointToSegment = (point: Point2, start: Point2, end: Point2) => {
  const [px, pz] = point;
  const [x1, z1] = start;
  const [x2, z2] = end;
  const dx = x2 - x1;
  const dz = z2 - z1;
  const lenSq = dx * dx + dz * dz;
  if (lenSq <= 1e-12) {
    return Math.hypot(px - x1, pz - z1);
  }
  const t = clampNumber(((px - x1) * dx + (pz - z1) * dz) / lenSq, 0, 1);
  const projX = x1 + dx * t;
  const projZ = z1 + dz * t;
  return Math.hypot(px - projX, pz - projZ);
};

const simplifyOpenPathRdp = (points: Point2[], epsilon: number): Point2[] => {
  if (points.length <= 2) return points;

  const first = points[0];
  const last = points[points.length - 1];
  let maxDistance = -1;
  let splitIndex = -1;

  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = distancePointToSegment(points[i], first, last);
    if (distance > maxDistance) {
      maxDistance = distance;
      splitIndex = i;
    }
  }

  if (maxDistance <= epsilon || splitIndex < 0) {
    return [first, last];
  }

  const left = simplifyOpenPathRdp(points.slice(0, splitIndex + 1), epsilon);
  const right = simplifyOpenPathRdp(points.slice(splitIndex), epsilon);
  return [...left.slice(0, -1), ...right];
};

const simplifyClosedPolygonRdp = (points: Point2[], epsilon: number) => {
  if (points.length <= 4) return points;

  let idxA = 0;
  let idxB = 1;
  let bestDistSq = 0;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const dx = points[i][0] - points[j][0];
      const dz = points[i][1] - points[j][1];
      const distSq = dx * dx + dz * dz;
      if (distSq > bestDistSq) {
        bestDistSq = distSq;
        idxA = i;
        idxB = j;
      }
    }
  }

  const path1 = points.slice(idxA, idxB + 1);
  const path2 = [...points.slice(idxB), ...points.slice(0, idxA + 1)];
  const simple1 = simplifyOpenPathRdp(path1, epsilon);
  const simple2 = simplifyOpenPathRdp(path2, epsilon);
  const combined = [
    ...simple1,
    ...simple2.slice(1, -1),
  ];
  return simplifyPolygonLoop(combined, epsilon * 0.35);
};


const traceMarchingBoundary = (
  xCoords: number[],
  zCoords: number[],
  keptVertices: boolean[][]
) => {
  if (xCoords.length < 2 || zCoords.length < 2) return null;

  const segments: BoundarySegment[] = [];
  const getEdgePoint = (xi: number, zi: number, edgeId: number): Point2 => {
    const x0 = xCoords[xi];
    const x1 = xCoords[xi + 1];
    const z0 = zCoords[zi];
    const z1 = zCoords[zi + 1];
    if (edgeId === 0) return [(x0 + x1) / 2, z0];
    if (edgeId === 1) return [x1, (z0 + z1) / 2];
    if (edgeId === 2) return [(x0 + x1) / 2, z1];
    return [x0, (z0 + z1) / 2];
  };

  const addSegment = (xi: number, zi: number, edgeA: number, edgeB: number) => {
    segments.push({
      start: getEdgePoint(xi, zi, edgeA),
      end: getEdgePoint(xi, zi, edgeB),
    });
  };

  for (let xi = 0; xi < xCoords.length - 1; xi += 1) {
    for (let zi = 0; zi < zCoords.length - 1; zi += 1) {
      const bl = keptVertices[xi][zi] ? 1 : 0;
      const br = keptVertices[xi + 1][zi] ? 1 : 0;
      const tr = keptVertices[xi + 1][zi + 1] ? 1 : 0;
      const tl = keptVertices[xi][zi + 1] ? 1 : 0;
      const index = bl + br * 2 + tr * 4 + tl * 8;
      if (index === 0 || index === 15) continue;

      if (index === 1) addSegment(xi, zi, 3, 0);
      else if (index === 2) addSegment(xi, zi, 0, 1);
      else if (index === 3) addSegment(xi, zi, 3, 1);
      else if (index === 4) addSegment(xi, zi, 1, 2);
      else if (index === 5) {
        addSegment(xi, zi, 3, 2);
        addSegment(xi, zi, 0, 1);
      } else if (index === 6) addSegment(xi, zi, 0, 2);
      else if (index === 7) addSegment(xi, zi, 3, 2);
      else if (index === 8) addSegment(xi, zi, 2, 3);
      else if (index === 9) addSegment(xi, zi, 0, 2);
      else if (index === 10) {
        addSegment(xi, zi, 0, 3);
        addSegment(xi, zi, 1, 2);
      } else if (index === 11) addSegment(xi, zi, 1, 2);
      else if (index === 12) addSegment(xi, zi, 1, 3);
      else if (index === 13) addSegment(xi, zi, 0, 1);
      else if (index === 14) addSegment(xi, zi, 3, 0);
    }
  }

  if (segments.length === 0) return null;

  const pointByKey = new Map<string, Point2>();
  const adjacency = new Map<string, string[]>();
  const edges = new Map<string, [string, string]>();
  const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const addAdjacency = (from: string, to: string) => {
    const list = adjacency.get(from) ?? [];
    if (!list.includes(to)) list.push(to);
    adjacency.set(from, list);
  };

  segments.forEach((segment) => {
    const aKey = pointKey(segment.start);
    const bKey = pointKey(segment.end);
    if (aKey === bKey) return;

    pointByKey.set(aKey, segment.start);
    pointByKey.set(bKey, segment.end);

    const key = edgeKey(aKey, bKey);
    if (!edges.has(key)) {
      edges.set(key, [aKey, bKey]);
      addAdjacency(aKey, bKey);
      addAdjacency(bKey, aKey);
    }
  });

  const visitedEdges = new Set<string>();
  const loops: Point2[][] = [];

  for (const [key, [startKey, nextKey]] of edges.entries()) {
    if (visitedEdges.has(key)) continue;

    const loopKeys: string[] = [startKey];
    let prevKey = startKey;
    let currentKey = nextKey;
    visitedEdges.add(key);
    let guard = 0;

    while (guard < edges.size + 8) {
      loopKeys.push(currentKey);
      if (currentKey === startKey) break;

      const neighbors = adjacency.get(currentKey) ?? [];
      const candidate = neighbors.find((neighborKey) => {
        if (neighborKey === prevKey) return false;
        return !visitedEdges.has(edgeKey(currentKey, neighborKey));
      });
      if (!candidate) {
        break;
      }

      visitedEdges.add(edgeKey(currentKey, candidate));
      prevKey = currentKey;
      currentKey = candidate;
      guard += 1;
    }

    if (loopKeys[loopKeys.length - 1] !== startKey) continue;
    loopKeys.pop();

    const loop = loopKeys
      .map((loopKey) => pointByKey.get(loopKey))
      .filter((point): point is Point2 => Boolean(point));
    const simplified = simplifyPolygonLoop(loop);
    if (simplified.length >= 3 && Math.abs(signedPolygonArea(simplified)) > OVERLAP_EPS * 2) {
      const area = signedPolygonArea(simplified);
      loops.push(area < 0 ? [...simplified].reverse() : simplified);
    }
  }

  if (loops.length === 0) return null;
  return loops;
};

const columnOverlapsCutter = (
  selectedFrame: OrientedFrame,
  linePoint: THREE.Vector3,
  cutterFrame: OrientedFrame,
  cutterFootprint: Point2[]
) => {
  const interval = intersectLineWithFrame(cutterFrame, linePoint, selectedFrame.axes[1], OVERLAP_EPS);
  if (!interval) return false;

  const selectedStart = -selectedFrame.half[1];
  const selectedEnd = selectedFrame.half[1];
  const overlapStart = Math.max(interval.start, selectedStart);
  const overlapEnd = Math.min(interval.end, selectedEnd);
  if (overlapEnd - overlapStart <= OVERLAP_EPS) return false;

  const sampleCount = 9;
  for (let i = 0; i < sampleCount; i += 1) {
    const t = overlapStart + ((overlapEnd - overlapStart) * i) / (sampleCount - 1);
    const worldPoint = linePoint.clone().add(selectedFrame.axes[1].clone().multiplyScalar(t));
    const cutterLocal = toFrameLocal(cutterFrame, worldPoint);
    if (Math.abs(cutterLocal.y) > cutterFrame.half[1] + OVERLAP_EPS) continue;
    if (pointInPolygonOrOnEdge(cutterLocal.x, cutterLocal.z, cutterFootprint)) {
      return true;
    }
  }

  return false;
};

const isParallelToSelectedPlane = (selectedFrame: OrientedFrame, cutterFrame: OrientedFrame) =>
  Math.abs(selectedFrame.axes[1].dot(cutterFrame.axes[1])) >= 0.999;

const getFrameBoundsInTargetFrame = (targetFrame: OrientedFrame, sourceFrame: OrientedFrame) => {
  const corners = getWorldCorners(sourceFrame).map((corner) => toFrameLocal(targetFrame, corner));
  return {
    xmin: Math.min(...corners.map((corner) => corner.x)),
    xmax: Math.max(...corners.map((corner) => corner.x)),
    ymin: Math.min(...corners.map((corner) => corner.y)),
    ymax: Math.max(...corners.map((corner) => corner.y)),
    zmin: Math.min(...corners.map((corner) => corner.z)),
    zmax: Math.max(...corners.map((corner) => corner.z)),
  };
};

const projectFootprintIntoFrame = (
  targetFrame: OrientedFrame,
  sourceFrame: OrientedFrame,
  points: Point2[]
) =>
  points.map(([x, z]) => {
    const worldPoint = sourceFrame.center.clone()
      .add(sourceFrame.axes[0].clone().multiplyScalar(x))
      .add(sourceFrame.axes[2].clone().multiplyScalar(z));
    const local = toFrameLocal(targetFrame, worldPoint);
    return [local.x, local.z] as Point2;
  });

const normalizeClipperRing = (ring: number[][]): Point2[] => {
  const normalized = ring.map(([x, z]) => [x, z] as Point2);
  if (normalized.length > 1) {
    const first = normalized[0];
    const last = normalized[normalized.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= OVERLAP_EPS) {
      normalized.pop();
    }
  }
  const simplified = simplifyPolygonLoop(normalized, OVERLAP_EPS * 0.5);
  if (simplified.length < 3) return simplified;
  return signedPolygonArea(simplified) < 0 ? [...simplified].reverse() : simplified;
};

const analyzeTrimmedFootprintExact = (selectedPart: PartData, cutterParts: PartData[]) => {
  const selectedFrame = buildOrientedFrame(selectedPart);
  const selectedFootprintPoints = getLocalFootprintPoints(selectedPart);
  const selected: FootprintPolygon = {
    points: selectedFootprintPoints,
    bounds: getLocalFootprintBounds(selectedFootprintPoints),
  };
  const selectedAabb = getFrameAabb(selectedFrame);

  const candidateCutters = cutterParts
    .map((part) => ({
      part,
      frame: buildOrientedFrame(part),
      footprint: getLocalFootprintPoints(part),
    }))
    .filter((item) => aabb3Overlaps(selectedAabb, getFrameAabb(item.frame)));

  if (candidateCutters.length === 0) {
    return { ok: false as const, message: 'No overlapping wood/sheet pieces were found to trim against.' };
  }

  if (candidateCutters.some((cutter) => !isParallelToSelectedPlane(selectedFrame, cutter.frame))) {
    return null;
  }

  const clipPolygons = candidateCutters
    .map((cutter) => {
      const cutterBounds = getFrameBoundsInTargetFrame(selectedFrame, cutter.frame);
      const overlapY = Math.min(selectedFrame.half[1], cutterBounds.ymax) - Math.max(-selectedFrame.half[1], cutterBounds.ymin);
      if (overlapY <= OVERLAP_EPS) return null;

      const projected = simplifyPolygonLoop(
        projectFootprintIntoFrame(selectedFrame, cutter.frame, cutter.footprint),
        OVERLAP_EPS * 0.5
      );
      if (projected.length < 3 || Math.abs(signedPolygonArea(projected)) <= OVERLAP_EPS * 2) return null;
      const ring = signedPolygonArea(projected) < 0 ? [...projected].reverse() : projected;
      return [ring.map(([x, z]) => [x, z])];
    })
    .filter((polygon): polygon is number[][][] => Boolean(polygon));

  if (clipPolygons.length === 0) {
    return { ok: false as const, message: 'No overlapping area found to trim on the selected piece.' };
  }

  const selectedArea = Math.abs(signedPolygonArea(selected.points));
  const rawResult = polygonClipping.difference(
    [selected.points.map(([x, z]) => [x, z])],
    ...clipPolygons
  ) as number[][][][] | null;

  if (!rawResult || rawResult.length === 0) {
    return { ok: false as const, message: 'Trim would remove the entire selected piece, so nothing was changed.' };
  }

  const polygons = rawResult
    .map((polygon) => ({
      outer: normalizeClipperRing(polygon[0] ?? []),
      holes: polygon.slice(1).map((ring) => normalizeClipperRing(ring)),
    }))
    .filter((polygon) => polygon.outer.length >= 3);

  const significantPolygons = polygons
    .map((polygon) => {
      const outerArea = Math.abs(signedPolygonArea(polygon.outer));
      const holeArea = polygon.holes.reduce((sum, hole) => sum + Math.abs(signedPolygonArea(hole)), 0);
      return {
        ...polygon,
        area: outerArea - holeArea,
      };
    })
    .filter((polygon) => polygon.area > OVERLAP_EPS * 4)
    .sort((a, b) => b.area - a.area);

  if (significantPolygons.length === 0) {
    return { ok: false as const, message: 'Trim would remove the entire selected piece, so nothing was changed.' };
  }

  if (significantPolygons.length > 1) {
    return {
      ok: false as const,
      message: 'Trim result split into multiple islands/holes. Try trimming in smaller steps.',
    };
  }

  const [result] = significantPolygons;
  const meaningfulHole = result.holes.some((hole) => Math.abs(signedPolygonArea(hole)) > OVERLAP_EPS * 8);
  if (meaningfulHole) {
    return {
      ok: false as const,
      message: 'Trim result split into multiple islands/holes. Try trimming in smaller steps.',
    };
  }

  const removedArea = selectedArea - result.area;
  if (removedArea <= OVERLAP_EPS * 4) {
    return { ok: false as const, message: 'No overlapping area found to trim on the selected piece.' };
  }

  const bounds = {
    xmin: Math.min(...result.outer.map(([x]) => x)),
    xmax: Math.max(...result.outer.map(([x]) => x)),
    zmin: Math.min(...result.outer.map(([, z]) => z)),
    zmax: Math.max(...result.outer.map(([, z]) => z)),
  };

  const bboxArea = (bounds.xmax - bounds.xmin) * (bounds.zmax - bounds.zmin);
  if (Math.abs(result.area - bboxArea) <= Math.max(OVERLAP_EPS * 2, bboxArea * 0.02)) {
    return {
      ok: true as const,
      bounds,
      profile: { type: 'rect' as const },
      removedArea,
    };
  }

  const centerX = (bounds.xmin + bounds.xmax) / 2;
  const centerZ = (bounds.zmin + bounds.zmax) / 2;
  const localPoints = result.outer.map(([x, z]) => [x - centerX, z - centerZ] as [number, number]);

  return {
    ok: true as const,
    bounds,
    profile: { type: 'polygon' as const, points: localPoints },
    removedArea,
  };
};

const analyzeTrimmedFootprintSampled = (selectedPart: PartData, cutterParts: PartData[]) => {
  const selectedFrame = buildOrientedFrame(selectedPart);
  const selectedFootprintPoints = getLocalFootprintPoints(selectedPart);
  const selected: FootprintPolygon = {
    points: selectedFootprintPoints,
    bounds: getLocalFootprintBounds(selectedFootprintPoints),
  };

  const selectedAabb = getFrameAabb(selectedFrame);
  const cutters = cutterParts
    .map((part) => ({
      part,
      frame: buildOrientedFrame(part),
      footprint: getLocalFootprintPoints(part),
    }))
    .filter((item) => aabb3Overlaps(selectedAabb, getFrameAabb(item.frame)));

  if (cutters.length === 0) {
    return { ok: false as const, message: 'No overlapping wood/sheet pieces were found to trim against.' };
  }

  const spanX = selected.bounds.xmax - selected.bounds.xmin;
  const spanZ = selected.bounds.zmax - selected.bounds.zmin;
  if (spanX <= OVERLAP_EPS || spanZ <= OVERLAP_EPS) {
    return { ok: false as const, message: 'Failed to analyze overlap region.' };
  }

  const aspect = spanX / Math.max(spanZ, OVERLAP_EPS);
  const targetSamples = 8200;
  const innerSampleX = clampNumber(Math.round(Math.sqrt(targetSamples * aspect)), 36, 130);
  const innerSampleZ = clampNumber(Math.round(Math.sqrt(targetSamples / Math.max(aspect, OVERLAP_EPS))), 36, 130);
  const stepX = spanX / Math.max(1, innerSampleX - 1);
  const stepZ = spanZ / Math.max(1, innerSampleZ - 1);
  const sampleX = innerSampleX + 2;
  const sampleZ = innerSampleZ + 2;
  const xCoords = Array.from({ length: sampleX }, (_, index) =>
    selected.bounds.xmin - stepX + stepX * index
  );
  const zCoords = Array.from({ length: sampleZ }, (_, index) =>
    selected.bounds.zmin - stepZ + stepZ * index
  );
  const cellArea = stepX * stepZ;

  const isKeptPoint = (x: number, z: number) => {
    const insideSelected = pointInPolygonOrOnEdge(x, z, selected.points);
    if (!insideSelected) return false;
    const linePoint = selectedFrame.center.clone()
      .add(selectedFrame.axes[0].clone().multiplyScalar(x))
      .add(selectedFrame.axes[2].clone().multiplyScalar(z));
    const blockedByOther = cutters.some((cutter) =>
      columnOverlapsCutter(selectedFrame, linePoint, cutter.frame, cutter.footprint)
    );
    return !blockedByOther;
  };

  const keptVertices = Array.from({ length: sampleX }, () => Array.from({ length: sampleZ }, () => false));
  for (let xi = 0; xi < sampleX; xi += 1) {
    for (let zi = 0; zi < sampleZ; zi += 1) {
      keptVertices[xi][zi] = isKeptPoint(xCoords[xi], zCoords[zi]);
    }
  }

  let removedArea = 0;
  let keptArea = 0;
  for (let xi = 0; xi < sampleX - 1; xi += 1) {
    for (let zi = 0; zi < sampleZ - 1; zi += 1) {
      const cx = (xCoords[xi] + xCoords[xi + 1]) / 2;
      const cz = (zCoords[zi] + zCoords[zi + 1]) / 2;
      const insideSelected = pointInPolygonOrOnEdge(cx, cz, selected.points);
      if (!insideSelected) continue;
      const kept = isKeptPoint(cx, cz);
      if (kept) {
        keptArea += cellArea;
      } else {
        removedArea += cellArea;
      }
    }
  }

  if (removedArea <= cellArea * 0.5) {
    return { ok: false as const, message: 'No overlapping area found to trim on the selected piece.' };
  }

  if (keptArea <= cellArea * 0.5) {
    return { ok: false as const, message: 'Trim would remove the entire selected piece, so nothing was changed.' };
  }

  const loops = traceMarchingBoundary(xCoords, zCoords, keptVertices);
  if (!loops || loops.length === 0) {
    return {
      ok: false as const,
      message: 'Trim result is not a single clean footprint. Try trimming in smaller steps.',
    };
  }

  const significantLoops = loops
    .map((loop) => ({ loop, area: Math.abs(signedPolygonArea(loop)) }))
    .filter((entry) => entry.area > cellArea * 2)
    .sort((a, b) => b.area - a.area);
  if (significantLoops.length === 0) {
    return {
      ok: false as const,
      message: 'Trim result is not a single clean footprint. Try trimming in smaller steps.',
    };
  }

  const mainLoop = significantLoops[0];
  const hasSecondMeaningfulLoop = significantLoops.slice(1).some((entry) =>
    entry.area > Math.max(cellArea * 12, mainLoop.area * 0.08)
  );
  if (hasSecondMeaningfulLoop) {
    return {
      ok: false as const,
      message: 'Trim result split into multiple islands/holes. Try trimming in smaller steps.',
    };
  }

  let boundary = simplifyPolygonLoop(mainLoop.loop, 0.02);
  if (boundary.length < 3) {
    return {
      ok: false as const,
      message: 'Trim result is not a single clean footprint. Try trimming in smaller steps.',
    };
  }

  const simplifyEpsilon = Math.max(stepX, stepZ) * 1.05;
  boundary = simplifyClosedPolygonRdp(boundary, simplifyEpsilon);
  boundary = simplifyPolygonLoop(
    clampBoundaryToBounds(boundary, selected.bounds, Math.max(stepX, stepZ) * 1.35),
    OVERLAP_EPS
  );
  if (boundary.length < 3) {
    return {
      ok: false as const,
      message: 'Trim result is not a single clean footprint. Try trimming in smaller steps.',
    };
  }

  const bounds = {
    xmin: Math.min(...boundary.map(([x]) => x)),
    xmax: Math.max(...boundary.map(([x]) => x)),
    zmin: Math.min(...boundary.map(([, z]) => z)),
    zmax: Math.max(...boundary.map(([, z]) => z)),
  };

  const boundaryArea = Math.abs(signedPolygonArea(boundary));
  const bboxArea = (bounds.xmax - bounds.xmin) * (bounds.zmax - bounds.zmin);
  if (Math.abs(boundaryArea - bboxArea) <= Math.max(OVERLAP_EPS * 2, bboxArea * 0.02)) {
    return {
      ok: true as const,
      bounds,
      profile: { type: 'rect' as const },
      removedArea,
    };
  }

  const centerX = (bounds.xmin + bounds.xmax) / 2;
  const centerZ = (bounds.zmin + bounds.zmax) / 2;
  const localPoints = boundary.map(([x, z]) => [x - centerX, z - centerZ] as [number, number]);

  return {
    ok: true as const,
    bounds,
    profile: { type: 'polygon' as const, points: localPoints },
    removedArea,
  };
};

const analyzeTrimmedFootprint = (selectedPart: PartData, cutterParts: PartData[]) => {
  const exactResult = analyzeTrimmedFootprintExact(selectedPart, cutterParts);
  const sampledResult = analyzeTrimmedFootprintSampled(selectedPart, cutterParts);

  if (exactResult === null) {
    return sampledResult;
  }

  if (!exactResult.ok) {
    return sampledResult.ok ? sampledResult : exactResult;
  }

  if (!sampledResult.ok) {
    const tinyTrimThreshold = 0.1;
    return exactResult.removedArea <= tinyTrimThreshold ? sampledResult : exactResult;
  }

  const conservativeTolerance = Math.max(0.12, sampledResult.removedArea * 0.28);
  if (exactResult.removedArea - sampledResult.removedArea > conservativeTolerance) {
    return sampledResult;
  }

  return exactResult;
};

export const Toolbar: React.FC = () => {
  const {
    tool,
    setTool,
    removePart,
    selectedId,
    resetScene,
    duplicatePart,
    setHingeAngle,
    snapEnabled,
    toggleSnap,
    edgeSnapEnabled,
    toggleEdgeSnap,
    selectAssistEnabled,
    toggleSelectAssist,
    parts,
    pastParts,
    futureParts,
    setParts,
    undo,
    redo,
    floorEnabled,
    toggleFloor,
    shadowsEnabled,
    toggleShadows,
    structuralOverlayEnabled,
    toggleStructuralOverlay,
    stressScenario,
    setStressScenario,
    stressIntensity,
    setStressIntensity,
    requestCameraFocus,
    explodeFactor,
    setExplodeFactor,
    unitSystem,
    setUnitSystem,
    autoScrewParts,
    sawPartId,
    sawFace,
    sawPath,
    sawPreviewPoint,
    clearSawPath,
    commitSawCut,
    selectPart,
    setHoveredId,
  } = useStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const specialMenuRef = useRef<HTMLDivElement>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportName, setExportName] = useState('wood-project');
  const [isControlPanelOpen, setIsControlPanelOpen] = useState(false);
  const [isControlPanelMinimized, setIsControlPanelMinimized] = useState(false);
  const [isSpecialMenuOpen, setIsSpecialMenuOpen] = useState(false);
  const [autoScrewTargetCount, setAutoScrewTargetCount] = useState(2);
  const [autoScrewFirstId, setAutoScrewFirstId] = useState<string | null>(null);
  const [autoScrewStatus, setAutoScrewStatus] = useState<{ tone: 'info' | 'success' | 'error'; text: string } | null>(null);
  const autoScrewLastHandledSelectionRef = useRef<string | null>(null);
  const selectedPart = parts.find((part) => part.id === selectedId);
  const sawDraftPart = sawPartId ? parts.find((part) => part.id === sawPartId) : null;
  const sawCurrentSegment = useMemo(() => {
    if (sawPath.length === 0 || !sawPreviewPoint) return null;
    const last = sawPath[sawPath.length - 1];
    const dx = sawPreviewPoint[0] - last[0];
    const dy = sawPreviewPoint[1] - last[1];
    const length = Math.hypot(dx, dy);
    if (length <= 1e-6) return null;
    const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    return { length, angle };
  }, [sawPath, sawPreviewPoint]);
  const autoScrewFirstPart = autoScrewFirstId ? parts.find((part) => part.id === autoScrewFirstId) : null;
  const canUndo = pastParts.length > 0;
  const canRedo = futureParts.length > 0;
  const structuralReport = useMemo(
    () => analyzeStructuralIntegrity(parts, { stressScenario, stressIntensity }),
    [parts, stressIntensity, stressScenario, structuralOverlayEnabled]
  );
  const structuralPercent = Math.round(structuralReport.overallScore * 100);
  const stressPercent = Math.round(structuralReport.stress.score * 100);
  const stressGradeToneClass = structuralReport.stress.score >= 0.82
    ? 'text-emerald-300'
    : structuralReport.stress.score >= 0.65
      ? 'text-amber-300'
      : 'text-rose-300';
  const activeStressRecommendation = stressScenario === 'baseline'
    ? structuralReport.recommendation
    : structuralReport.stress.recommendation;
  const getStressIcon = (scenarioId: StressScenario) => {
    if (scenarioId === 'vertical-load') return <ArrowDown size={12} />;
    if (scenarioId === 'lateral-rack') return <MoveHorizontal size={12} />;
    if (scenarioId === 'torsion-twist') return <RotateCcw size={12} />;
    if (scenarioId === 'impact-burst') return <Zap size={12} />;
    return <ActivitySquare size={12} />;
  };
  const selectedHinge = selectedPart?.hardwareKind === 'hinge' ? selectedPart : null;
  const hingeRangeRad = (() => {
    const defaultMin = (-110 * Math.PI) / 180;
    const defaultMax = (110 * Math.PI) / 180;
    if (!selectedHinge) return [defaultMin, defaultMax] as const;
    const rawMin = selectedHinge.hinge?.minAngle;
    const rawMax = selectedHinge.hinge?.maxAngle;
    if (rawMin === undefined && rawMax === undefined) return [defaultMin, defaultMax] as const;
    const min = Math.min(rawMin ?? defaultMin, rawMax ?? defaultMax);
    const max = Math.max(rawMin ?? defaultMin, rawMax ?? defaultMax);
    if (Math.abs(min) <= 0.0001 && Math.abs(max - Math.PI) <= 0.0001) {
      return [defaultMin, defaultMax] as const;
    }
    return [min, max] as const;
  })();
  const hingeMinDeg = (hingeRangeRad[0] * 180) / Math.PI;
  const hingeMaxDeg = (hingeRangeRad[1] * 180) / Math.PI;
  const hingeAngleDeg = selectedHinge ? ((selectedHinge.hinge?.angle ?? 0) * 180) / Math.PI : 0;

  const handleDelete = () => {
    if (selectedId) {
      removePart(selectedId);
    }
  };

  const handleDuplicate = () => {
    if (!selectedId) return;
    const sourceId = selectedId;
    if (tool === 'move' || tool === 'rotate') {
      // Keep duplicate in-place in transform modes; stability is handled by control/snap guards.
      setHoveredId(null);
      duplicatePart(sourceId);
      return;
    }
    duplicatePart(sourceId);
  };

  const handleReset = () => {
    if (window.confirm('Are you sure you want to delete everything and reset the scene?')) {
      resetScene();
    }
    setIsSpecialMenuOpen(false);
  };

  useEffect(() => {
    if (!isSpecialMenuOpen) return;

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (isSpecialMenuOpen && !specialMenuRef.current?.contains(target)) {
        setIsSpecialMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isSpecialMenuOpen]);

  useEffect(() => {
    if (tool !== 'auto-screw') {
      setAutoScrewFirstId(null);
      setAutoScrewStatus(null);
      autoScrewLastHandledSelectionRef.current = null;
      setHoveredId(null);
    }
  }, [setHoveredId, tool]);

  useEffect(() => {
    if (tool !== 'auto-screw' || !selectedId) return;
    if (autoScrewLastHandledSelectionRef.current === selectedId) return;
    autoScrewLastHandledSelectionRef.current = selectedId;

    const pickedPart = parts.find((part) => part.id === selectedId);
    if (!pickedPart) return;
    if (pickedPart.type === 'hardware') {
      setAutoScrewStatus({
        tone: 'error',
        text: 'Pick wood or sheet parts only. Hardware parts are ignored.',
      });
      return;
    }

    if (!autoScrewFirstId) {
      setAutoScrewFirstId(selectedId);
      setAutoScrewStatus({
        tone: 'info',
        text: `Entry piece selected: ${pickedPart.name}.`,
      });
      return;
    }

    if (autoScrewFirstId === selectedId) {
      setAutoScrewStatus({
        tone: 'info',
        text: `Entry piece locked: ${pickedPart.name}. Pick a different second piece.`,
      });
      return;
    }

    const placement = autoScrewParts(autoScrewFirstId, selectedId, autoScrewTargetCount);
    if (placement.ok) {
      setAutoScrewFirstId(null);
      setAutoScrewStatus({
        tone: 'success',
        text: `Placed ${placement.screwCount} screw${placement.screwCount === 1 ? '' : 's'}.`,
      });
      autoScrewLastHandledSelectionRef.current = null;
      selectPart(null);
      return;
    }

    setAutoScrewFirstId(null);
    setAutoScrewStatus({
      tone: 'error',
      text: placement.message,
    });
    autoScrewLastHandledSelectionRef.current = null;
    selectPart(null);
  }, [autoScrewFirstId, autoScrewParts, autoScrewTargetCount, parts, selectPart, selectedId, tool]);

  const handleOpenExport = () => {
    setIsExportModalOpen(true);
  };

  const handleCommitSawCut = () => {
    const result = commitSawCut();
    if (!result.ok) {
      alert(result.message);
    }
  };

  const handleExitSaw = () => {
    clearSawPath();
    setTool('select');
  };

  const handleActivateAutoScrew = () => {
    setIsSpecialMenuOpen(false);
    setTool('auto-screw');
    setAutoScrewFirstId(null);
    setAutoScrewStatus(null);
    autoScrewLastHandledSelectionRef.current = null;
    selectPart(null);
  };

  const handleExitAutoScrew = () => {
    setTool('select');
    setAutoScrewFirstId(null);
    setAutoScrewStatus(null);
    autoScrewLastHandledSelectionRef.current = null;
  };

  const handleTrimOverlaps = () => {
    if (!selectedPart) {
      alert('Select a wood or sheet piece first.');
      return;
    }

    if (selectedPart.type === 'hardware') {
      alert('Trim Overlaps only works on wood or sheet pieces.');
      return;
    }

    const cutterParts = parts.filter((part) => {
      if (part.id === selectedPart.id) return false;
      if (part.type === 'hardware') return false;
      return true;
    });

    const trimmed = analyzeTrimmedFootprint(selectedPart, cutterParts);
    if (!trimmed.ok) {
      alert(trimmed.message);
      return;
    }

    const newWidth = trimmed.bounds.xmax - trimmed.bounds.xmin;
    const newDepth = trimmed.bounds.zmax - trimmed.bounds.zmin;
    if (newWidth <= OVERLAP_EPS || newDepth <= OVERLAP_EPS) {
      alert('Trim result is too small to keep. No changes were applied.');
      return;
    }

    const selectedFrame = buildOrientedFrame(selectedPart);
    const localCenter = new THREE.Vector3(
      (trimmed.bounds.xmin + trimmed.bounds.xmax) / 2,
      0,
      (trimmed.bounds.zmin + trimmed.bounds.zmax) / 2
    );
    const worldCenter = selectedFrame.center.clone()
      .add(selectedFrame.axes[0].clone().multiplyScalar(localCenter.x))
      .add(selectedFrame.axes[2].clone().multiplyScalar(localCenter.z));

    const updatedPart: PartData = {
      ...selectedPart,
      dimensions: [newWidth, selectedPart.dimensions[1], newDepth],
      position: [
        worldCenter.x,
        worldCenter.y,
        worldCenter.z,
      ],
      profile: trimmed.profile,
    };

    setParts(parts.map((part) => (part.id === selectedPart.id ? updatedPart : part)));
    setIsSpecialMenuOpen(false);
  };

  const handleConfirmExport = () => {
    const payload = {
      projectName: exportName.trim() || 'wood-design',
      exportedAt: new Date().toISOString(),
      parts,
    };

    const data = JSON.stringify(payload, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sanitizeFilename(exportName);
    a.click();
    URL.revokeObjectURL(url);
    setIsExportModalOpen(false);
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const parsed = JSON.parse(content);
          const importedParts = Array.isArray(parsed) ? parsed : parsed?.parts;

          if (Array.isArray(importedParts)) {
            setParts(importedParts);
            requestCameraFocus();
            if (typeof parsed?.projectName === 'string' && parsed.projectName.trim()) {
              setExportName(parsed.projectName.trim());
            }
          } else {
            alert('Invalid file format: expected parts array');
          }
        } catch (error) {
          console.error('Failed to parse file', error);
          alert('Invalid file format');
        }
      };
      reader.readAsText(file);
    }
    event.target.value = '';
  };

  const tools = [
    { id: 'select', icon: MousePointer2, label: 'Select' },
    { id: 'move', icon: Move, label: 'Move' },
    { id: 'rotate', icon: RotateCw, label: 'Rotate' },
    { id: 'saw', icon: Scissors, label: 'Saw' },
  ] as const;

  return (
    <>
      <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur rounded-lg shadow-lg p-1.5 sm:p-2 flex flex-col gap-1 z-20 max-w-[calc(100%-0.5rem)] overflow-visible">
        <div className="flex flex-wrap items-center justify-center gap-0.5 sm:gap-2">
        {tools.map((t) => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            className={`p-1.5 sm:p-2 rounded-md transition-colors ${
              tool === t.id
                ? 'bg-blue-100 text-blue-600'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title={t.label}
          >
            <t.icon size={18} />
          </button>
        ))}

        <div className="w-px h-6 bg-slate-200 mx-1 hidden sm:block" />

        <button
          onClick={handleDelete}
          disabled={!selectedId}
          className={`p-1.5 sm:p-2 rounded-md transition-colors ${
            !selectedId
              ? 'text-slate-300 cursor-not-allowed'
              : 'text-red-600 hover:bg-red-50'
          }`}
          title="Delete Selected"
        >
          <Trash2 size={18} />
        </button>

        <button
          onClick={handleDuplicate}
          disabled={!selectedId}
          className={`p-1.5 sm:p-2 rounded-md transition-colors ${
            !selectedId
              ? 'text-slate-300 cursor-not-allowed'
              : 'text-blue-600 hover:bg-blue-50'
          }`}
          title="Duplicate Selected"
        >
          <Copy size={18} />
        </button>

        <div className="inline-flex items-center gap-0.5 sm:gap-0.5 shrink-0 whitespace-nowrap">
          <button
            onClick={undo}
            disabled={!canUndo}
            className={`p-1.5 sm:p-2 rounded-md transition-colors ${
              canUndo
                ? 'text-slate-600 hover:bg-slate-100'
                : 'text-slate-300 cursor-not-allowed'
            }`}
            title="Undo"
          >
            <Undo2 size={18} />
          </button>

          <button
            onClick={redo}
            disabled={!canRedo}
            className={`p-1.5 sm:p-2 rounded-md transition-colors ${
              canRedo
                ? 'text-slate-600 hover:bg-slate-100'
                : 'text-slate-300 cursor-not-allowed'
            }`}
            title="Redo"
          >
            <Redo2 size={18} />
          </button>
        </div>

        <button
          onClick={requestCameraFocus}
          className="p-1.5 sm:p-2 rounded-md text-slate-600 hover:bg-slate-100 transition-colors"
          title="Auto Center Camera"
        >
          <LocateFixed size={18} />
        </button>

        </div>

        <div className="w-full flex items-center justify-center gap-1 sm:gap-1.5 flex-nowrap overflow-visible">

        <div className="relative">
          <button
            onClick={() => {
              setIsSpecialMenuOpen(false);
              setIsControlPanelOpen((prev) => {
                const next = !prev;
                if (next) {
                  setIsControlPanelMinimized(false);
                }
                return next;
              });
            }}
            className={`inline-flex items-center justify-center gap-0 sm:gap-1.5 px-1.5 sm:px-2 py-1.5 sm:py-2 min-w-9 rounded-md transition-colors ${
              isControlPanelOpen
                ? 'bg-cyan-100 text-cyan-700 ring-1 ring-cyan-300'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title="Control Panel"
            aria-haspopup="dialog"
            aria-expanded={isControlPanelOpen}
          >
            <Cpu size={14} />
            <span className="hidden sm:inline text-xs font-medium">Control Panel</span>
            <span className="inline-flex">
              {isControlPanelOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </span>
          </button>

          {isControlPanelOpen && (
            <div className={`fixed right-1 sm:right-3 top-[6.65rem] sm:top-[5.1rem] z-30 w-[min(17rem,calc(100vw-0.5rem))] sm:w-[min(19.5rem,calc(100vw-0.75rem))] overflow-y-auto rounded-xl border border-cyan-300/40 bg-slate-950/78 shadow-[0_0_34px_rgba(34,211,238,0.2)] backdrop-blur-md p-2 sm:p-2.5 [scrollbar-width:thin] [scrollbar-color:#22d3ee66_#0f172a] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-slate-900/70 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gradient-to-b [&::-webkit-scrollbar-thumb]:from-cyan-300/85 [&::-webkit-scrollbar-thumb]:to-blue-500/80 [&::-webkit-scrollbar-thumb]:border [&::-webkit-scrollbar-thumb]:border-cyan-100/40 ${
              isControlPanelMinimized ? 'max-h-[10vh] sm:max-h-[11vh]' : 'max-h-[34vh] sm:max-h-[38vh]'
            }`}>
              <div className="relative">
              <button
                onClick={() => setIsControlPanelMinimized((prev) => !prev)}
                className="absolute right-1 top-1 sm:right-1.5 sm:top-1.5 inline-flex items-center justify-center rounded p-1 text-cyan-200 hover:text-cyan-50 hover:bg-cyan-500/15 transition-colors z-10"
                title={isControlPanelMinimized ? 'Expand Control Panel' : 'Minimize Control Panel'}
                aria-label={isControlPanelMinimized ? 'Expand control panel' : 'Minimize control panel'}
              >
                {isControlPanelMinimized ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              <div className="flex min-h-[1.35rem] items-center justify-between pr-9 sm:pr-10 text-[10px] uppercase tracking-[0.22em] text-cyan-300">
                <span>Future Build Console</span>
                <div className="flex items-center">
                  <span className="font-mono text-cyan-100">{structuralPercent}%</span>
                </div>
              </div>
              {!isControlPanelMinimized && (
                <>
                  <div className="mt-1 text-sm font-semibold text-cyan-50">
                    Futuristic Control Panel
                  </div>
                  <div className="mt-1 text-[11px] text-cyan-100/80">
                    Diagnostic tools and visual analyzers for fast design feedback.
                  </div>
                </>
              )}

              {isControlPanelMinimized ? (
                <div className="mt-1 grid grid-cols-1 gap-1">
                  <div className="rounded-lg border border-cyan-300/25 bg-slate-900/75 p-1">
                    <div className="flex items-center justify-between">
                      <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-cyan-300/90">
                        <Maximize2 size={12} />
                        Explosion
                      </div>
                      <div className="font-mono text-[11px] text-cyan-100">{explodeFactor.toFixed(2)}</div>
                    </div>
                    <div className="mt-0.5 px-0.5">
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={explodeFactor}
                        onChange={(e) => setExplodeFactor(parseFloat(e.target.value))}
                        className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-slate-800 accent-cyan-400"
                        aria-label="Explosion slider"
                      />
                    </div>
                  </div>
                  <div className="rounded-lg border border-cyan-300/25 bg-slate-900/75 p-1">
                    <div className="flex items-center justify-between">
                      <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-cyan-300/90">
                        <Shield size={12} />
                        Heat Map
                      </div>
                      <button
                        onClick={toggleStructuralOverlay}
                        className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                          structuralOverlayEnabled
                            ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-300/40'
                            : 'bg-slate-800 text-slate-300 border border-slate-700'
                        }`}
                      >
                        {structuralOverlayEnabled ? 'On' : 'Off'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-1.5 grid grid-cols-1 gap-2">
                  <div className="rounded-lg border border-cyan-300/25 bg-slate-900/75 p-1.5">
                    <div className="flex items-center justify-between">
                      <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-cyan-300/90">
                        <Maximize2 size={12} />
                        Explosion
                      </div>
                      <div className="font-mono text-[11px] text-cyan-100">{explodeFactor.toFixed(2)}</div>
                    </div>
                    <div className="mt-1 px-1">
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={explodeFactor}
                        onChange={(e) => setExplodeFactor(parseFloat(e.target.value))}
                        className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-slate-800 accent-cyan-400"
                        aria-label="Explosion slider"
                      />
                      <div className="mt-1 flex justify-between text-[10px] font-mono text-cyan-100/80">
                        <span>0.00 NORMAL</span>
                        <span>1.00 FULL EXPLODE</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-cyan-300/25 bg-slate-900/75 p-1.5">
                    <div className="flex items-center justify-between">
                      <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-cyan-300/90">
                        <Shield size={12} />
                        Structural Stress Lab
                      </div>
                      <button
                        onClick={toggleStructuralOverlay}
                        className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                          structuralOverlayEnabled
                            ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-300/40'
                            : 'bg-slate-800 text-slate-300 border border-slate-700'
                        }`}
                        title="Toggle heat map overlay"
                      >
                        {structuralOverlayEnabled ? 'On' : 'Off'}
                      </button>
                    </div>

                    <div className="mt-2 flex items-end justify-between gap-2">
                      <div>
                        <div className="text-[11px] text-cyan-100/80">
                          {stressScenario === 'baseline' ? 'Build Grade' : 'Scenario Grade'}
                        </div>
                        <div className={`text-2xl font-semibold ${stressGradeToneClass}`}>
                          {structuralReport.stress.grade}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] text-cyan-100/80">
                          {stressScenario === 'baseline' ? 'Service Score' : 'Stress Score'}
                        </div>
                        <div className="font-mono text-lg text-cyan-100">{stressPercent}%</div>
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      {STRESS_SCENARIO_OPTIONS.map((scenarioOption) => {
                        const active = stressScenario === scenarioOption.id;
                        return (
                          <button
                            key={scenarioOption.id}
                            onClick={() => {
                              setStressScenario(scenarioOption.id);
                              if (scenarioOption.id !== 'baseline' && !structuralOverlayEnabled) {
                                toggleStructuralOverlay();
                              }
                            }}
                            className={`rounded border px-2 py-1 text-[10px] text-left transition-colors ${
                              active
                                ? 'border-cyan-300/70 bg-cyan-500/20 text-cyan-100'
                                : 'border-slate-700 bg-slate-900/80 text-slate-300 hover:border-cyan-400/40 hover:text-cyan-100'
                            }`}
                            title={scenarioOption.description}
                          >
                            <span className="inline-flex items-center gap-1.5">
                              {getStressIcon(scenarioOption.id)}
                              {scenarioOption.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-2">
                      <div className="flex items-center justify-between text-[10px] text-cyan-100/80">
                        <span>Force Intensity</span>
                        <span className="font-mono">{Math.round(stressIntensity * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={stressIntensity}
                        onChange={(e) => setStressIntensity(parseFloat(e.target.value))}
                        className="mt-1 w-full h-2 rounded-lg appearance-none cursor-pointer bg-slate-800 accent-cyan-400"
                        aria-label="Stress force intensity"
                      />
                    </div>

                    <div className="mt-2 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-rose-500 via-amber-400 to-cyan-400 transition-[width] duration-200"
                        style={{ width: `${stressPercent}%` }}
                      />
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] text-cyan-100/70">
                      <span>Weak</span>
                      <span>Strong</span>
                    </div>
                    <div className="mt-1 text-[10px] font-mono text-cyan-200/80">
                      Heat map: red = highest demand vs span/support limits, cyan = lowest demand.
                    </div>
                    <div className="mt-1 text-[10px] text-cyan-100/80">
                      {structuralReport.stress.description}
                    </div>

                    <div className="mt-2 text-[11px] text-cyan-100/80">
                      {structuralOverlayEnabled
                        ? 'Heat map overlay active on all wood pieces.'
                        : 'Enable overlay to see stability heat map directly on parts.'}
                    </div>
                    <div className="mt-1 text-[11px] text-cyan-100/80">
                      {activeStressRecommendation}
                    </div>
                  </div>

                  <div className="rounded-lg border border-cyan-300/25 bg-slate-900/75 p-1.5">
                    <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-cyan-300/90">
                      <ActivitySquare size={12} />
                      Build Telemetry
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div className="rounded border border-slate-700 bg-slate-900/80 px-2 py-1.5">
                        <div className="text-[10px] text-slate-400">Wood Pieces</div>
                        <div className="text-sm font-semibold text-cyan-100">{structuralReport.stats.woodPartCount}</div>
                      </div>
                      <div className="rounded border border-slate-700 bg-slate-900/80 px-2 py-1.5">
                        <div className="text-[10px] text-slate-400">Fasteners</div>
                        <div className="text-sm font-semibold text-cyan-100">{structuralReport.stats.fastenerCount}</div>
                      </div>
                      <div className="rounded border border-slate-700 bg-slate-900/80 px-2 py-1.5">
                        <div className="text-[10px] text-slate-400">Joined Fasteners</div>
                        <div className="text-sm font-semibold text-cyan-100">{structuralReport.stats.bridgingFasteners}</div>
                      </div>
                      <div className="rounded border border-slate-700 bg-slate-900/80 px-2 py-1.5">
                        <div className="text-[10px] text-slate-400">Est. Weight</div>
                        <div className="text-sm font-semibold text-cyan-100">{formatWeight(structuralReport.stats.estimatedWeightLb, unitSystem)}</div>
                      </div>
                      <div className="rounded border border-slate-700 bg-slate-900/80 px-2 py-1.5">
                        <div className="text-[10px] text-slate-400">Footprint</div>
                        <div className="text-sm font-semibold text-cyan-100">{formatArea(structuralReport.stats.footprintSqFt, unitSystem)}</div>
                      </div>
                      <div className="rounded border border-slate-700 bg-slate-900/80 px-2 py-1.5">
                        <div className="inline-flex items-center gap-1 text-[10px] text-slate-400"><Layers size={10} />Groups</div>
                        <div className="text-sm font-semibold text-cyan-100">{structuralReport.stats.connectedGroups}</div>
                      </div>
                      <div className="rounded border border-slate-700 bg-slate-900/80 px-2 py-1.5">
                        <div className="inline-flex items-center gap-1 text-[10px] text-slate-400"><Gauge size={10} />Max Span</div>
                        <div className="text-sm font-semibold text-cyan-100">{formatLengthWithUnit(structuralReport.stats.maxSpanIn, unitSystem, 1)}</div>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-cyan-100/80">
                      <div>Worst Deflection: {formatLengthWithUnit(structuralReport.stats.worstDeflectionIn, unitSystem, 2)}</div>
                      <div>Deflection Ratio: {structuralReport.stats.worstDeflectionRatio.toFixed(2)}x</div>
                      <div>Bending Ratio: {structuralReport.stats.worstBendingRatio.toFixed(2)}x</div>
                      <div>Column Ratio: {structuralReport.stats.worstAxialRatio.toFixed(2)}x</div>
                      <div>Rack Ratio: {structuralReport.stats.worstRackRatio.toFixed(2)}x</div>
                      <div>Support Coverage: {(structuralReport.stats.supportCoverage * 100).toFixed(0)}%</div>
                    </div>
                  </div>
                </div>
              )}
              </div>
            </div>
          )}
        </div>

        <div className="relative" ref={specialMenuRef}>
          <button
            onClick={() => {
              setIsSpecialMenuOpen((prev) => !prev);
            }}
            className={`inline-flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-1.5 sm:py-2 rounded-md transition-colors ${
              isSpecialMenuOpen || tool === 'auto-screw'
                ? 'bg-blue-100 text-blue-600'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title="Special Tools (Dropdown)"
            aria-label="Special tools dropdown"
            aria-haspopup="menu"
            aria-expanded={isSpecialMenuOpen}
          >
            <Wrench size={16} />
            <span className="hidden sm:inline text-xs font-medium">Special Tools</span>
            {isSpecialMenuOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {isSpecialMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-52 rounded-lg border border-slate-200 bg-white shadow-xl p-1.5 z-50">
              <div className="px-2.5 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Building
              </div>
              <button
                onClick={handleActivateAutoScrew}
                className="w-full flex items-center justify-between px-2.5 py-2 text-left text-sm rounded-md text-slate-700 hover:bg-slate-100 transition-colors"
                role="menuitem"
                title="Automatically place screws between two selected wood pieces."
              >
                <span className="flex items-center gap-2">
                  <Hammer size={16} />
                  Auto Screw
                </span>
                {tool === 'auto-screw' && <Check size={14} className="text-blue-600" />}
              </button>

              <button
                onClick={handleTrimOverlaps}
                className="w-full flex items-center justify-between px-2.5 py-2 text-left text-sm rounded-md text-slate-700 hover:bg-slate-100 transition-colors"
                role="menuitem"
                title="Trim away overlapping regions from the selected wood or sheet piece."
              >
                <span className="flex items-center gap-2">
                  <Scissors size={16} />
                  Trim Overlaps
                </span>
              </button>

              <div className="my-1 h-px bg-slate-200" />
              <div className="px-2.5 pt-0.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Handling
              </div>
              <button
                onClick={toggleSelectAssist}
                className="w-full flex items-center justify-between px-2.5 py-2 text-left text-sm rounded-md text-slate-700 hover:bg-slate-100 transition-colors"
                role="menuitem"
                title="In Select mode, hovering a wood piece flashes it green."
              >
                <span className="flex items-center gap-2">
                  <MousePointer2 size={16} />
                  Select Assist {selectAssistEnabled ? 'On' : 'Off'}
                </span>
                {selectAssistEnabled && <Check size={14} className="text-blue-600" />}
              </button>

              <button
                onClick={toggleSnap}
                className="w-full flex items-center justify-between px-2.5 py-2 text-left text-sm rounded-md text-slate-700 hover:bg-slate-100 transition-colors"
                role="menuitem"
                title="Snap move/rotate steps to fixed increments for cleaner alignment."
              >
                <span className="flex items-center gap-2">
                  <Magnet size={16} />
                  Snapping {snapEnabled ? 'On' : 'Off'}
                </span>
                {snapEnabled && <Check size={14} className="text-blue-600" />}
              </button>

              <button
                onClick={toggleEdgeSnap}
                className="w-full flex items-center justify-between px-2.5 py-2 text-left text-sm rounded-md text-slate-700 hover:bg-slate-100 transition-colors"
                role="menuitem"
                title="Snap wood edges together automatically when moved close."
              >
                <span className="flex items-center gap-2">
                  <Magnet size={16} />
                  Edge Snap {edgeSnapEnabled ? 'On' : 'Off'}
                </span>
                {edgeSnapEnabled && <Check size={14} className="text-blue-600" />}
              </button>

              <div className="my-1 h-px bg-slate-200" />
              <div className="px-2.5 pt-0.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Settings
              </div>
              <div className="flex items-center justify-between px-2.5 py-2 text-sm text-slate-700">
                <span className="flex items-center gap-2">
                  <Ruler size={16} />
                  Units
                </span>
                <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5 shadow-sm">
                  <button
                    onClick={() => setUnitSystem('default')}
                    className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                      unitSystem === 'default'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                    type="button"
                  >
                    Default
                  </button>
                  <button
                    onClick={() => setUnitSystem('metric')}
                    className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                      unitSystem === 'metric'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                    type="button"
                  >
                    Metric
                  </button>
                </div>
              </div>

              <button
                onClick={toggleFloor}
                className="w-full flex items-center justify-between px-2.5 py-2 text-left text-sm rounded-md text-slate-700 hover:bg-slate-100 transition-colors"
                role="menuitem"
                title="Show or hide the ground reference floor."
              >
                <span className="flex items-center gap-2">
                  <Grid size={16} />
                  Floor {floorEnabled ? 'On' : 'Off'}
                </span>
                {floorEnabled && <Check size={14} className="text-blue-600" />}
              </button>

              <button
                onClick={toggleShadows}
                className="w-full flex items-center justify-between px-2.5 py-2 text-left text-sm rounded-md text-slate-700 hover:bg-slate-100 transition-colors"
                role="menuitem"
                title="Enable higher-quality cast shadows for better depth and realism."
              >
                <span className="flex items-center gap-2">
                  <Sun size={16} />
                  Shadows {shadowsEnabled ? 'On' : 'Off'}
                </span>
                {shadowsEnabled && <Check size={14} className="text-blue-600" />}
              </button>

              <button
                onClick={handleReset}
                className="w-full flex items-center justify-between px-2.5 py-2 text-left text-sm rounded-md text-red-600 hover:bg-red-50 transition-colors"
                role="menuitem"
                title="Clear all parts and reset the scene."
              >
                <span className="flex items-center gap-2">
                  <RotateCcw size={16} />
                  Reset Scene
                </span>
              </button>
            </div>
          )}
        </div>

        <div className="inline-flex items-center gap-0.5 sm:gap-1 shrink-0 whitespace-nowrap">
          <button
            onClick={handleOpenExport}
            className="p-1.5 sm:p-2 rounded-md text-slate-600 hover:bg-slate-100 transition-colors"
            title="Save Design"
          >
            <Download size={18} />
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 sm:p-2 rounded-md text-slate-600 hover:bg-slate-100 transition-colors"
            title="Load Design"
          >
            <Upload size={18} />
          </button>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImport}
          accept=".json"
          className="hidden"
        />
        </div>
      </div>

      {tool === 'auto-screw' && (
        <div className="fixed top-[7rem] sm:top-[6.2rem] left-1/2 -translate-x-1/2 z-10 w-[min(25rem,calc(100%-0.8rem))] rounded-lg border border-blue-200 bg-white/95 backdrop-blur shadow-lg px-2.5 py-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Auto Screw Mode</div>
              <div className="mt-0.5 text-[10px] text-slate-700">
                {!autoScrewFirstPart
                  ? `Step 1: Select the entry piece (screw head side). Target: ${autoScrewTargetCount} screw${autoScrewTargetCount === 1 ? '' : 's'}.`
                  : `Step 2: Select the destination piece to join with ${autoScrewFirstPart.name}. Target: ${autoScrewTargetCount} screw${autoScrewTargetCount === 1 ? '' : 's'}.`}
              </div>
              <div className="mt-1.5 flex items-center gap-1">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-700">Screws</div>
                {[1, 2, 3, 4].map((count) => (
                  <button
                    key={count}
                    onClick={() => setAutoScrewTargetCount(count)}
                    className={`inline-flex h-5 min-w-5 items-center justify-center rounded border px-1 text-[10px] font-semibold transition-colors ${
                      autoScrewTargetCount === count
                        ? 'border-blue-500 bg-blue-600 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                    title={`Try placing ${count} screw${count === 1 ? '' : 's'}`}
                  >
                    {count}
                  </button>
                ))}
              </div>
              {autoScrewStatus && (
                <div
                  className={`mt-1 text-[11px] ${
                    autoScrewStatus.tone === 'success'
                      ? 'text-emerald-700'
                      : autoScrewStatus.tone === 'error'
                        ? 'text-amber-700'
                        : 'text-slate-600'
                  }`}
                >
                  {autoScrewStatus.text}
                </div>
              )}
            </div>
            <button
              onClick={handleExitAutoScrew}
              className="shrink-0 inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-1.5 py-0.5 text-[11px] text-red-700 hover:bg-red-100 transition-colors"
              title="Exit Auto Screw Mode"
            >
              <X size={12} />
              Exit
            </button>
          </div>
        </div>
      )}

      {tool === 'saw' && (
        <div className="fixed top-[7rem] sm:top-[6.2rem] left-1/2 -translate-x-1/2 z-10 w-[min(28rem,calc(100%-0.8rem))] rounded-lg border border-amber-200 bg-white/95 backdrop-blur shadow-lg px-2.5 py-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Saw Mode</div>
              <div className="mt-0.5 text-[10px] text-slate-700">
                {sawDraftPart
                  ? `Selected: ${sawDraftPart.name}. Hover to preview the next point, click to place segments, and finish on an edge to split.`
                  : 'Select a wood or sheet part, then hover a face to preview the first point.'}
              </div>
              <div className="mt-1 text-[11px] text-slate-600">
                Points: {sawPath.length}
              </div>
              {sawFace && (
                <div className="mt-0.5 text-[11px] text-slate-600">
                  Face: {sawFace.plane === 'xz' ? 'Top/Bottom' : sawFace.plane === 'xy' ? 'Front/Back' : 'Left/Right'}
                </div>
              )}
              {sawCurrentSegment && (
                <div className="mt-0.5 text-[11px] text-slate-700">
                  Current cut: {formatLengthWithUnit(sawCurrentSegment.length, unitSystem)} at {Math.round(sawCurrentSegment.angle)}°
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={handleExitSaw}
                className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-1.5 py-0.5 text-[11px] text-red-700 hover:bg-red-100 transition-colors"
                title="Exit Saw Mode"
              >
                <X size={12} />
                Exit
              </button>
              <button
                onClick={clearSawPath}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-700 hover:bg-slate-100 transition-colors"
                title="Clear Saw Path"
              >
                <RotateCcw size={12} />
                Clear
              </button>
              <button
                onClick={handleCommitSawCut}
                disabled={sawPath.length < 2}
                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] transition-colors ${
                  sawPath.length >= 2
                    ? 'border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                    : 'border border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
                title="Split Along Saw Path"
              >
                <Check size={12} />
                Split
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedHinge && (
        <div
          className="fixed z-20 w-[min(21rem,calc(100vw-1.5rem))] rounded-xl border border-slate-300 bg-white/95 backdrop-blur shadow-xl p-3"
          style={{
            left: 'calc(env(safe-area-inset-left, 0px) + 0.75rem)',
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)',
          }}
        >
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-slate-700">Hinge Quick Control</div>
            <div className="text-xs font-mono text-slate-500">{hingeAngleDeg.toFixed(0)} deg</div>
          </div>
          <div className="mt-1 text-[11px] text-slate-500 truncate">{selectedHinge.name}</div>
          <div className="mt-2 text-[10px] text-slate-500">Swing Angle (center = 0)</div>
          <input
            type="range"
            min={hingeMinDeg}
            max={hingeMaxDeg}
            step={1}
            value={hingeAngleDeg}
            onChange={(e) => setHingeAngle(selectedHinge.id, (parseFloat(e.target.value) * Math.PI) / 180)}
            className="mt-2 w-full"
            aria-label="Hinge quick angle"
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              onClick={() => setHingeAngle(selectedHinge.id, (hingeMinDeg * Math.PI) / 180)}
              className="py-1.5 text-xs rounded border border-slate-300 bg-white hover:bg-slate-100"
            >
              Min
            </button>
            <button
              onClick={() => setHingeAngle(selectedHinge.id, (hingeMaxDeg * Math.PI) / 180)}
              className="py-1.5 text-xs rounded border border-slate-300 bg-white hover:bg-slate-100"
            >
              Max
            </button>
          </div>
        </div>
      )}

      {isExportModalOpen && (
        <div className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-xl border border-slate-200 shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-800">Export Project</h3>
              <p className="text-sm text-slate-500 mt-1">Choose a project name for the exported filename.</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Project Name</label>
              <input
                autoFocus
                value={exportName}
                onChange={(e) => setExportName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleConfirmExport();
                  }
                }}
                placeholder="My workshop plan"
                className="w-full px-3 py-2 text-sm border rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <div className="text-xs text-slate-500">
                File: <span className="font-mono">{sanitizeFilename(exportName)}</span>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="px-3 py-1.5 text-sm rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmExport}
                className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
              >
                Export
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

