import React, { useState, useMemo } from 'react';
import { useStore } from '../store';
import { PartData } from '../types';
import { ClipboardList, ExternalLink, FileDown, ShoppingCart } from 'lucide-react';

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

type Point2 = [number, number];

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

const getLCutPoints = (
  width: number,
  depth: number,
  cutWidth: number,
  cutDepth: number,
  corner: 'front-left' | 'front-right' | 'back-left' | 'back-right'
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

const homeDepotSearchUrl = (query: string) => `https://www.homedepot.com/s/${encodeURIComponent(query)}`;

const homeDepotQueryForPart = (part: PartData) => {
  if (part.hardwareKind === 'dowel') {
    return `${part.name} wood dowel rod`;
  }
  if (part.hardwareKind === 'hinge') {
    return `${part.name} heavy duty hinge`;
  }
  if (part.type === 'hardware') {
    return `${part.name} hardware`;
  }
  if (part.type === 'sheet') {
    return `${part.name} plywood sheet`;
  }
  return `${part.name} lumber board`;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const footprintPoints = (part: PartData): Point2[] => {
  const width = part.dimensions[0];
  const depth = part.dimensions[2];
  const minX = -width / 2;
  const maxX = width / 2;
  const minZ = -depth / 2;
  const maxZ = depth / 2;

  if (part.profile?.type === 'polygon' && part.profile.points && part.profile.points.length >= 3) {
    return part.profile.points;
  }

  if (part.profile?.type === 'l-cut') {
    const cutWidth = part.profile.cutWidth ?? width / 2;
    const cutDepth = part.profile.cutDepth ?? depth / 2;
    return getLCutPoints(width, depth, cutWidth, cutDepth, part.profile.corner ?? 'front-left');
  }

  return [
    [minX, minZ],
    [maxX, minZ],
    [maxX, maxZ],
    [minX, maxZ],
  ];
};

const buildPathForSvg = (points: Point2[], size = 148, padding = 12) => {
  const xs = points.map((p) => p[0]);
  const zs = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const spanX = Math.max(maxX - minX, 0.01);
  const spanZ = Math.max(maxZ - minZ, 0.01);
  const scale = Math.min((size - padding * 2) / spanX, (size - padding * 2) / spanZ);

  const toSvg = ([x, z]: Point2): Point2 => ([
    (x - minX) * scale + padding,
    (maxZ - z) * scale + padding,
  ]);

  const projected = points.map(toSvg);
  const path = projected.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');

  return {
    path: `${path} Z`,
    toSvg,
    bounds: {
      minX,
      maxX,
      minZ,
      maxZ,
    },
    size,
  };
};

const cutShapeSvg = (part: PartData) => {
  if (part.type === 'hardware') {
    const radius = 42;
    return `
      <svg viewBox="0 0 148 148" width="148" height="148" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="146" height="146" fill="#f8fafc" stroke="#cbd5e1"/>
        <circle cx="74" cy="74" r="${radius}" fill="#dbeafe" stroke="#2563eb" stroke-width="3"/>
        <text x="74" y="80" text-anchor="middle" font-size="12" fill="#1e3a8a" font-family="Arial">HARDWARE</text>
      </svg>
    `;
  }

  const points = footprintPoints(part);
  const { path, toSvg, bounds, size } = buildPathForSvg(points);

  let overlays = '';
  if (part.profile?.type === 'angled') {
    const leftTop = toSvg([bounds.minX, bounds.maxZ]);
    const leftBottom = toSvg([bounds.minX, bounds.minZ]);
    const rightTop = toSvg([bounds.maxX, bounds.maxZ]);
    const rightBottom = toSvg([bounds.maxX, bounds.minZ]);
    overlays = `
      <line x1="${leftTop[0] + 2}" y1="${leftTop[1] + 6}" x2="${leftBottom[0] + 16}" y2="${leftBottom[1] - 6}" stroke="#dc2626" stroke-width="2" />
      <line x1="${rightTop[0] - 2}" y1="${rightTop[1] + 6}" x2="${rightBottom[0] - 16}" y2="${rightBottom[1] - 6}" stroke="#dc2626" stroke-width="2" />
    `;
  }

  return `
    <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="${size - 2}" height="${size - 2}" fill="#f8fafc" stroke="#cbd5e1"/>
      <path d="${path}" fill="#bfdbfe" stroke="#1d4ed8" stroke-width="2" />
      ${overlays}
      <text x="${size / 2}" y="${size - 8}" text-anchor="middle" font-size="10" fill="#334155" font-family="Arial">Top View</text>
    </svg>
  `;
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

  if (part.profile.type === 'angled') {
    const startAngle = part.profile.startAngle ?? 0;
    const endAngle = part.profile.endAngle ?? 0;
    return {
      summary: '2 angled end cuts',
      steps: [
        `Start end: set saw to ${formatInches(Math.abs(startAngle))} deg (${startAngle >= 0 ? 'positive tilt' : 'negative tilt'})`,
        `End end: set saw to ${formatInches(Math.abs(endAngle))} deg (${endAngle >= 0 ? 'positive tilt' : 'negative tilt'})`,
      ],
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

  if (part.profile.type === 'angled') {
    return [
      'angled',
      roundTo(part.profile.startAngle ?? 0),
      roundTo(part.profile.endAngle ?? 0),
    ].join('|');
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

  if (part.profile.type === 'angled') {
    return `Angled ends: start ${formatInches(part.profile.startAngle ?? 0)} deg, end ${formatInches(part.profile.endAngle ?? 0)} deg`;
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

  const homeDepotRows = useMemo(() => {
    return Object.entries(shoppingList).map(([name, info]) => {
      const part = parts.find((item) => item.name === name);
      const query = homeDepotQueryForPart(part ?? {
        id: '',
        name,
        type: 'hardware',
        dimensions: [0, 0, 0],
        position: [0, 0, 0],
        rotation: [0, 0, 0],
      });

      return {
        name,
        qty: info.count,
        details: info.details,
        query,
        url: homeDepotSearchUrl(query),
      };
    });
  }, [parts, shoppingList]);

  const downloadHomeDepotReport = () => {
    if (homeDepotRows.length === 0) return;

    const rowsHtml = homeDepotRows
      .map((row) => `
        <tr>
          <td>${escapeHtml(row.name)}</td>
          <td>${row.qty}</td>
          <td>${escapeHtml(row.details)}</td>
          <td><a href="${row.url}" target="_blank" rel="noopener noreferrer">Open Link</a></td>
        </tr>
      `)
      .join('');

    const exportedAt = new Date().toLocaleString();
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Home Depot Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #0f172a; }
    h1 { margin-bottom: 6px; }
    p { color: #475569; margin-top: 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 18px; }
    th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; }
    a { color: #1d4ed8; text-decoration: none; }
  </style>
</head>
<body>
  <h1>Home Depot Shopping Report</h1>
  <p>Generated ${escapeHtml(exportedAt)}</p>
  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th>Qty</th>
        <th>Estimate</th>
        <th>Search Link</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'home-depot-report.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const downloadCutReport = () => {
    if (cutList.length === 0) return;

    const cards = cutList.map(({ key, part, count }, index) => {
      const profileLabel = formatProfile(part) ?? 'Rectangular profile';
      const recipe = cutRecipe(part);
      const steps = recipe?.steps ?? ['No custom cuts required beyond final dimensions.'];
      const stepsHtml = steps
        .map((step, stepIndex) => `<li>${escapeHtml(`${stepIndex + 1}. ${step}`)}</li>`)
        .join('');

      return `
        <article class="card">
          <div class="shape">${cutShapeSvg(part)}</div>
          <div class="content">
            <h2>${index + 1}. ${escapeHtml(part.name)} <span class="badge">x${count}</span></h2>
            <p class="meta">Dimensions: ${escapeHtml(`${part.dimensions[0].toFixed(1)}" x ${part.dimensions[1].toFixed(1)}" x ${part.dimensions[2].toFixed(1)}"`)} | Type: ${escapeHtml(part.type)}</p>
            <p class="profile">${escapeHtml(profileLabel)}</p>
            <p class="summary"><strong>Cut Plan:</strong> ${escapeHtml(recipe?.summary ?? 'Standard rectangular cutting')}</p>
            <ol class="steps">${stepsHtml}</ol>
          </div>
        </article>
      `;
    }).join('');

    const generatedAt = new Date().toLocaleString();
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Cut Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 22px; color: #0f172a; background: #f8fafc; }
    h1 { margin: 0 0 6px 0; }
    .sub { margin: 0 0 16px 0; color: #475569; font-size: 13px; }
    .cards { display: grid; gap: 12px; }
    .card { display: grid; grid-template-columns: 168px 1fr; gap: 12px; background: #fff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px; }
    .shape { display: flex; align-items: flex-start; justify-content: center; }
    .content h2 { margin: 0 0 6px 0; font-size: 17px; }
    .badge { display: inline-block; margin-left: 6px; font-size: 12px; background: #dbeafe; color: #1e3a8a; border-radius: 999px; padding: 2px 8px; }
    .meta { margin: 0; font-size: 12px; color: #475569; }
    .profile { margin: 6px 0 0 0; font-size: 12px; color: #1d4ed8; font-weight: 600; }
    .summary { margin: 8px 0 0 0; font-size: 13px; }
    .steps { margin: 6px 0 0 18px; padding: 0; font-size: 12px; color: #1f2937; }
    .steps li { margin: 4px 0; }
    @media (max-width: 720px) {
      .card { grid-template-columns: 1fr; }
      .shape { justify-content: flex-start; }
    }
  </style>
</head>
<body>
  <h1>Cut Report</h1>
  <p class="sub">Generated ${escapeHtml(generatedAt)} | Unique cuts: ${cutList.length} | Total parts: ${parts.length}</p>
  <section class="cards">${cards}</section>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cut-report.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

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
                <button
                  onClick={downloadCutReport}
                  className="w-full flex items-center justify-center gap-2 py-2 text-xs rounded-md bg-blue-700 text-white font-medium hover:bg-blue-800 transition-colors"
                >
                  <FileDown size={14} />
                  Download Cut Report
                </button>
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
                <button
                  onClick={downloadHomeDepotReport}
                  className="w-full flex items-center justify-center gap-2 py-2 text-xs rounded-md bg-orange-600 text-white font-medium hover:bg-orange-700 transition-colors"
                >
                  <ExternalLink size={14} />
                  Home Depot Report
                </button>
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
                    <a
                      href={homeDepotSearchUrl(homeDepotQueryForPart(parts.find((part) => part.name === name) ?? {
                        id: '',
                        name,
                        type: 'hardware',
                        dimensions: [0, 0, 0],
                        position: [0, 0, 0],
                        rotation: [0, 0, 0],
                      }))}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900"
                    >
                      <ExternalLink size={12} />
                      Search at Home Depot
                    </a>
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
