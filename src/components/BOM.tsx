import React, { useState, useMemo } from 'react';
import { useStore } from '../store';
import { PartData } from '../types';
import { ClipboardList, ShoppingCart } from 'lucide-react';

const roundTo = (value: number) => value.toFixed(3);
const CUT_PLAN_EPS = 0.0001;

type NotchRect = {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
};

type CutRecipe = {
  summary: string;
  steps: string[];
};

const formatInches = (value: number) => {
  const rounded = Math.round(value * 100) / 100;
  const text = rounded.toFixed(2);
  return text.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
};

const uniqueSorted = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const unique: number[] = [];

  sorted.forEach((value) => {
    if (unique.length === 0 || Math.abs(unique[unique.length - 1] - value) > CUT_PLAN_EPS) {
      unique.push(value);
    }
  });

  return unique;
};

const pointInPolygon = (x: number, z: number, points: [number, number][]) => {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i][0];
    const zi = points[i][1];
    const xj = points[j][0];
    const zj = points[j][1];

    const intersects = ((zi > z) !== (zj > z))
      && (x < ((xj - xi) * (z - zi)) / ((zj - zi) || Number.EPSILON) + xi);

    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
};

const lCutNotchRect = (part: PartData): NotchRect | null => {
  if (!part.profile || part.profile.type !== 'l-cut') return null;

  const width = part.dimensions[0];
  const depth = part.dimensions[2];
  const minX = -width / 2;
  const maxX = width / 2;
  const minZ = -depth / 2;
  const maxZ = depth / 2;
  const cutWidth = part.profile.cutWidth ?? width / 2;
  const cutDepth = part.profile.cutDepth ?? depth / 2;
  const corner = part.profile.corner ?? 'front-left';

  if (corner === 'front-left') {
    return { x0: minX, x1: minX + cutWidth, z0: maxZ - cutDepth, z1: maxZ };
  }
  if (corner === 'front-right') {
    return { x0: maxX - cutWidth, x1: maxX, z0: maxZ - cutDepth, z1: maxZ };
  }
  if (corner === 'back-left') {
    return { x0: minX, x1: minX + cutWidth, z0: minZ, z1: minZ + cutDepth };
  }
  return { x0: maxX - cutWidth, x1: maxX, z0: minZ, z1: minZ + cutDepth };
};

const polygonNotches = (part: PartData): NotchRect[] => {
  if (!part.profile || part.profile.type !== 'polygon' || !part.profile.points || part.profile.points.length < 3) {
    return [];
  }

  const width = part.dimensions[0];
  const depth = part.dimensions[2];
  const minX = -width / 2;
  const maxX = width / 2;
  const minZ = -depth / 2;
  const maxZ = depth / 2;
  const points = part.profile.points;

  const xs = uniqueSorted([minX, maxX, ...points.map((p) => p[0])]);
  const zs = uniqueSorted([minZ, maxZ, ...points.map((p) => p[1])]);
  const nx = xs.length - 1;
  const nz = zs.length - 1;

  const missing = Array.from({ length: nx }, () => Array.from({ length: nz }, () => false));

  for (let xi = 0; xi < nx; xi += 1) {
    for (let zi = 0; zi < nz; zi += 1) {
      const x0 = xs[xi];
      const x1 = xs[xi + 1];
      const z0 = zs[zi];
      const z1 = zs[zi + 1];
      const area = (x1 - x0) * (z1 - z0);
      if (area <= CUT_PLAN_EPS * CUT_PLAN_EPS) continue;

      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const inside = pointInPolygon(cx, cz, points);
      missing[xi][zi] = !inside;
    }
  }

  const visited = Array.from({ length: nx }, () => Array.from({ length: nz }, () => false));
  const notches: NotchRect[] = [];

  for (let zi = 0; zi < nz; zi += 1) {
    for (let xi = 0; xi < nx; xi += 1) {
      if (!missing[xi][zi] || visited[xi][zi]) continue;

      let xEnd = xi + 1;
      while (xEnd < nx && missing[xEnd][zi] && !visited[xEnd][zi]) {
        xEnd += 1;
      }

      let zEnd = zi + 1;
      let canGrow = true;
      while (canGrow && zEnd < nz) {
        for (let x = xi; x < xEnd; x += 1) {
          if (!missing[x][zEnd] || visited[x][zEnd]) {
            canGrow = false;
            break;
          }
        }
        if (canGrow) {
          zEnd += 1;
        }
      }

      for (let z = zi; z < zEnd; z += 1) {
        for (let x = xi; x < xEnd; x += 1) {
          visited[x][z] = true;
        }
      }

      notches.push({
        x0: xs[xi],
        x1: xs[xEnd],
        z0: zs[zi],
        z1: zs[zEnd],
      });
    }
  }

  return notches.sort((a, b) => ((b.x1 - b.x0) * (b.z1 - b.z0)) - ((a.x1 - a.x0) * (a.z1 - a.z0)));
};

const notchToInstruction = (notch: NotchRect, part: PartData) => {
  const minX = -part.dimensions[0] / 2;
  const minZ = -part.dimensions[2] / 2;
  const width = notch.x1 - notch.x0;
  const depth = notch.z1 - notch.z0;
  const fromLeft = notch.x0 - minX;
  const fromBack = notch.z0 - minZ;
  return `Remove ${formatInches(width)}" x ${formatInches(depth)}" at left ${formatInches(fromLeft)}", back ${formatInches(fromBack)}"`;
};

const cutRecipe = (part: PartData): CutRecipe | null => {
  if (part.type === 'hardware' || !part.profile || part.profile.type === 'rect') {
    return null;
  }

  if (part.profile.type === 'l-cut') {
    const notch = lCutNotchRect(part);
    if (!notch) return null;
    return {
      summary: '2 straight cuts (1 corner notch)',
      steps: [notchToInstruction(notch, part)],
    };
  }

  if (part.profile.type === 'polygon') {
    const notches = polygonNotches(part);
    if (notches.length === 0) {
      return {
        summary: 'Custom profile',
        steps: ['No automatic notch breakdown available.'],
      };
    }

    const steps = notches.map((notch) => notchToInstruction(notch, part));
    return {
      summary: `${notches.length * 2} straight cuts (${notches.length} notch${notches.length > 1 ? 'es' : ''})`,
      steps,
    };
  }

  return null;
};

const profileSignature = (part: PartData) => {
  if (part.type === 'hardware') {
    return 'hardware';
  }

  if (!part.profile || part.profile.type === 'rect') {
    return 'rect';
  }

  if (part.profile.type === 'polygon' && part.profile.points) {
    const serializedPoints = part.profile.points
      .map(([x, z]) => `${roundTo(x)},${roundTo(z)}`)
      .join(';');
    return ['polygon', serializedPoints].join('|');
  }

  return [
    'l-cut',
    roundTo(part.profile.cutWidth ?? part.dimensions[0] / 2),
    roundTo(part.profile.cutDepth ?? part.dimensions[2] / 2),
    part.profile.corner ?? 'front-left',
  ].join('|');
};

const cutKey = (part: PartData) => {
  return [
    part.name,
    part.type,
    ...part.dimensions.map((dimension) => roundTo(dimension)),
    profileSignature(part),
  ].join('|');
};

const formatProfile = (part: PartData) => {
  if (!part.profile || part.profile.type === 'rect' || part.type === 'hardware') {
    return null;
  }

  if (part.profile.type === 'polygon') {
    return 'Custom merged profile';
  }

  const corner = (part.profile.corner ?? 'front-left').replace('-', ' ');
  return `L-cut: ${part.profile.cutWidth?.toFixed(1) ?? (part.dimensions[0] / 2).toFixed(1)}" x ${part.profile.cutDepth?.toFixed(1) ?? (part.dimensions[2] / 2).toFixed(1)}" (${corner})`;
};

const calculateShoppingList = (parts: PartData[]) => {
  const groups: Record<string, number[]> = {};
  const hardware: Record<string, number> = {};

  parts.forEach((part) => {
    if (part.type === 'hardware') {
      hardware[part.name] = (hardware[part.name] || 0) + 1;
      return;
    }

    if (!groups[part.name]) {
      groups[part.name] = [];
    }
    const length = Math.max(...part.dimensions);
    groups[part.name].push(length);
  });

  const shoppingList: Record<string, { count: number; totalLength: number; details: string }> = {};

  Object.entries(hardware).forEach(([name, count]) => {
    shoppingList[name] = {
      count,
      totalLength: 0,
      details: `${count} unit${count > 1 ? 's' : ''}`,
    };
  });

  const STOCK_LENGTH = 96;

  Object.entries(groups).forEach(([name, lengths]) => {
    lengths.sort((a, b) => b - a);

    const bins: number[] = [];

    lengths.forEach((len) => {
      let fitted = false;
      for (let i = 0; i < bins.length; i += 1) {
        if (bins[i] >= len) {
          bins[i] -= len;
          fitted = true;
          break;
        }
      }
      if (!fitted) {
        if (len > STOCK_LENGTH) {
          const count = Math.ceil(len / STOCK_LENGTH);
          for (let k = 0; k < count; k += 1) {
            bins.push(0);
          }
        } else {
          bins.push(STOCK_LENGTH - len);
        }
      }
    });

    shoppingList[name] = {
      count: bins.length,
      totalLength: lengths.reduce((a, b) => a + b, 0),
      details: `${bins.length} x 8ft (96\") Board${bins.length > 1 ? 's' : ''}`,
    };
  });

  return shoppingList;
};

export const BOM: React.FC = () => {
  const { parts } = useStore();
  const [tab, setTab] = useState<'cut' | 'shop'>('cut');

  const shoppingList = useMemo(() => calculateShoppingList(parts), [parts]);
  const cutList = useMemo(() => {
    const grouped = new Map<string, { key: string; part: PartData; count: number }>();

    parts.forEach((part) => {
      const key = cutKey(part);
      const existing = grouped.get(key);
      if (existing) {
        existing.count += 1;
        return;
      }
      grouped.set(key, { key, part, count: 1 });
    });

    return Array.from(grouped.values());
  }, [parts]);

  return (
    <div className="w-full bg-white border-l border-slate-200 h-full min-h-0 flex flex-col z-10 overflow-hidden">
      <div className="p-4 border-b border-slate-200 shrink-0">
        <h2 className="font-semibold text-lg text-slate-800">Bill of Materials</h2>
        <div className="flex gap-2 mt-4 bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setTab('cut')}
            className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-all ${
              tab === 'cut'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <ClipboardList size={14} />
            Cut List
          </button>
          <button
            onClick={() => setTab('shop')}
            className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-all ${
              tab === 'shop'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <ShoppingCart size={14} />
            Shopping List
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {parts.length === 0 ? (
          <div className="text-center text-slate-400 py-8">
            Scene is empty.
          </div>
        ) : (
          <>
            {tab === 'cut' && (
              <div className="space-y-4">
                <div className="flex justify-between text-xs font-semibold text-slate-500 pb-2 border-b border-slate-100">
                  <span>Cut</span>
                  <span>Dimensions (W x H x L)</span>
                </div>
                {cutList.map(({ key, part, count }, index) => {
                  const profileLabel = formatProfile(part);
                  const recipe = cutRecipe(part);
                  return (
                  <div key={key} className="py-2 border-b border-slate-50 last:border-0">
                    <div className="flex justify-between items-start text-sm gap-2">
                      <div className="font-medium text-slate-700 flex items-center gap-2 min-w-0">
                        <span className="w-5 h-5 bg-slate-100 rounded-full flex items-center justify-center text-[10px] text-slate-500 shrink-0">
                          {index + 1}
                        </span>
                        <span className="truncate">{part.name}</span>
                        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[11px] shrink-0">x{count}</span>
                      </div>
                      <div className="text-slate-500 font-mono text-xs text-right min-w-0 max-w-[16rem]">
                        <div className="whitespace-nowrap">
                          {part.dimensions[0].toFixed(1)}" x {part.dimensions[1].toFixed(1)}" x {part.dimensions[2].toFixed(1)}"
                        </div>
                        {profileLabel && (
                          <div className="mt-1 text-[11px] font-medium font-sans text-blue-700 whitespace-normal break-words">
                            {profileLabel}
                          </div>
                        )}
                      </div>
                    </div>
                    {recipe && (
                      <div className="mt-2 ml-7 rounded-md border border-blue-100 bg-blue-50/40 px-2 py-1.5">
                        <div className="text-[11px] font-semibold text-blue-800">
                          Cut Plan: {recipe.summary}
                        </div>
                        <div className="mt-1 space-y-1">
                          {recipe.steps.slice(0, 4).map((step, stepIndex) => (
                            <div key={`${key}-step-${stepIndex}`} className="text-[11px] text-slate-700 break-words">
                              {stepIndex + 1}. {step}
                            </div>
                          ))}
                          {recipe.steps.length > 4 && (
                            <div className="text-[11px] text-slate-500 italic">
                              +{recipe.steps.length - 4} more cut steps
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )})}
                <div className="text-xs text-slate-400 mt-4 text-center">
                  Unique Cuts: {cutList.length} | Total Parts: {parts.length}
                </div>
              </div>
            )}

            {tab === 'shop' && (
              <div className="space-y-6">
                {Object.entries(shoppingList).map(([name, info]) => (
                  <div key={name} className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <div className="font-semibold text-slate-800 mb-1">{name}</div>
                    <div className="flex justify-between items-end">
                      <div className="text-xs text-slate-500">
                        <div>Est. Material:</div>
                        <div className="font-medium text-slate-700">{info.details}</div>
                      </div>
                      <div className="text-xl font-bold text-blue-600">
                        {info.count} <span className="text-sm font-normal text-slate-500">qty</span>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="text-xs text-slate-400 mt-4 text-center italic">
                  Calculated for 96" (8ft) stock lengths.<br />
                  Does not account for kerf width.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
