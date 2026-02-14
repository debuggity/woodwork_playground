import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { MousePointer2, Move, RotateCw, Trash2, RotateCcw, Copy, Magnet, Download, Upload, Grid, ChevronDown, ChevronUp, LocateFixed, Wrench, Check, Hammer, X, Bomb } from 'lucide-react';

const sanitizeFilename = (value: string) => {
  const trimmed = value.trim();
  const safe = trimmed.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-');
  const normalized = safe || 'wood-design';
  return normalized.endsWith('.json') ? normalized : `${normalized}.json`;
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
    parts,
    setParts,
    floorEnabled,
    toggleFloor,
    requestCameraFocus,
    explodeFactor,
    setExplodeFactor,
    autoScrewParts,
    selectPart,
  } = useStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const specialMenuRef = useRef<HTMLDivElement>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportName, setExportName] = useState('wood-project');
  const [isExplosionPanelOpen, setIsExplosionPanelOpen] = useState(false);
  const [isSpecialMenuOpen, setIsSpecialMenuOpen] = useState(false);
  const [autoScrewFirstId, setAutoScrewFirstId] = useState<string | null>(null);
  const [autoScrewStatus, setAutoScrewStatus] = useState<{ tone: 'info' | 'success' | 'error'; text: string } | null>(null);
  const autoScrewLastHandledSelectionRef = useRef<string | null>(null);
  const selectedPart = parts.find((part) => part.id === selectedId);
  const autoScrewFirstPart = autoScrewFirstId ? parts.find((part) => part.id === autoScrewFirstId) : null;
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
    duplicatePart(selectedId, { selectDuplicate: tool === 'select' });
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
    }
  }, [tool]);

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
        text: `First piece selected: ${pickedPart.name}. Step 2: click the second piece.`,
      });
      return;
    }

    if (autoScrewFirstId === selectedId) {
      setAutoScrewStatus({
        tone: 'info',
        text: 'Pick a different second piece.',
      });
      return;
    }

    const placement = autoScrewParts(autoScrewFirstId, selectedId);
    if (placement.ok) {
      setTool('select');
      setAutoScrewFirstId(null);
      setAutoScrewStatus(null);
      autoScrewLastHandledSelectionRef.current = null;
      return;
    }

    setAutoScrewStatus({
      tone: 'error',
      text: placement.message,
    });
  }, [autoScrewFirstId, autoScrewParts, parts, selectedId, tool]);

  const handleOpenExport = () => {
    setIsExportModalOpen(true);
  };

  const handleActivateAutoScrew = () => {
    setIsSpecialMenuOpen(false);
    setTool('auto-screw');
    setAutoScrewFirstId(null);
    setAutoScrewStatus({
      tone: 'info',
      text: 'Step 1: click the first wood piece, then click the second piece.',
    });
    autoScrewLastHandledSelectionRef.current = null;
    selectPart(null);
  };

  const handleExitAutoScrew = () => {
    setTool('select');
    setAutoScrewFirstId(null);
    setAutoScrewStatus(null);
    autoScrewLastHandledSelectionRef.current = null;
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
  ] as const;

  return (
    <>
      <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur rounded-lg shadow-lg p-1.5 sm:p-2 flex flex-wrap items-center justify-center gap-0.5 sm:gap-2 z-20 max-w-[calc(100%-0.5rem)]">
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

        <button
          onClick={requestCameraFocus}
          className="p-1.5 sm:p-2 rounded-md text-slate-600 hover:bg-slate-100 transition-colors"
          title="Auto Center Camera"
        >
          <LocateFixed size={18} />
        </button>

        <div className="relative">
          <button
            onClick={() => {
              setIsSpecialMenuOpen(false);
              setIsExplosionPanelOpen((prev) => !prev);
            }}
            className={`inline-flex items-center justify-center gap-0 sm:gap-1.5 px-1.5 sm:px-2 py-1.5 sm:py-2 min-w-9 rounded-md transition-colors ${
              isExplosionPanelOpen
                ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-300'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title="Explosion Slider"
            aria-haspopup="dialog"
            aria-expanded={isExplosionPanelOpen}
          >
            <Bomb size={14} />
            <span className="hidden sm:inline-flex">
              {isExplosionPanelOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </span>
          </button>

          {isExplosionPanelOpen && (
            <div className="fixed left-1/2 -translate-x-1/2 top-[5.75rem] sm:top-[4.25rem] z-30 w-[min(22rem,calc(100vw-0.75rem))] rounded-xl border border-amber-300/50 bg-slate-950/90 shadow-[0_0_40px_rgba(251,146,60,0.22)] backdrop-blur-md p-3">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.22em] text-amber-300">
                <span>Explosion Matrix</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-amber-100">{explodeFactor.toFixed(2)}</span>
                  <button
                    onClick={() => setIsExplosionPanelOpen(false)}
                    className="inline-flex items-center justify-center rounded p-1 text-amber-200 hover:text-amber-50 hover:bg-amber-500/15 transition-colors"
                    title="Minimize Explosion Slider"
                    aria-label="Minimize explosion slider"
                  >
                    <ChevronDown size={13} />
                  </button>
                </div>
              </div>
              <div className="mt-1 text-sm font-semibold text-amber-50">
                Explosion Slider
              </div>
              <div className="mt-1 text-[11px] text-amber-100/80">
                Click the <span className="font-semibold">Explosion button</span> again to collapse this panel.
              </div>
              <div className="mt-2 px-1">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={explodeFactor}
                  onChange={(e) => setExplodeFactor(parseFloat(e.target.value))}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-slate-800 accent-amber-400"
                  aria-label="Explosion slider"
                />
                <div className="mt-1 flex justify-between text-[10px] font-mono text-amber-200/90">
                  <span>0.00 NORMAL</span>
                  <span>1.00 FULL EXPLODE</span>
                </div>
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-300 via-orange-400 to-red-500 transition-[width] duration-150"
                  style={{ width: `${explodeFactor * 100}%` }}
                />
              </div>
              <div className="mt-2 text-[11px] text-amber-100/80">
                Pull the model apart to inspect fit, order, and spacing.
              </div>
            </div>
          )}
        </div>

        <div className="relative" ref={specialMenuRef}>
          <button
            onClick={() => {
              setIsSpecialMenuOpen((prev) => !prev);
            }}
            className={`p-1.5 sm:p-2 rounded-md transition-colors ${
              isSpecialMenuOpen || tool === 'auto-screw'
                ? 'bg-blue-100 text-blue-600'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title="Special Tools"
            aria-haspopup="menu"
            aria-expanded={isSpecialMenuOpen}
          >
            <Wrench size={18} />
          </button>

          {isSpecialMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-52 rounded-lg border border-slate-200 bg-white shadow-xl p-1.5 z-30">
              <button
                onClick={handleActivateAutoScrew}
                className="w-full flex items-center justify-between px-2.5 py-2 text-left text-sm rounded-md text-slate-700 hover:bg-slate-100 transition-colors"
                role="menuitem"
              >
                <span className="flex items-center gap-2">
                  <Hammer size={16} />
                  Auto Screw
                </span>
                {tool === 'auto-screw' && <Check size={14} className="text-blue-600" />}
              </button>

              <button
                onClick={toggleFloor}
                className="w-full flex items-center justify-between px-2.5 py-2 text-left text-sm rounded-md text-slate-700 hover:bg-slate-100 transition-colors"
                role="menuitem"
              >
                <span className="flex items-center gap-2">
                  <Grid size={16} />
                  Floor {floorEnabled ? 'On' : 'Off'}
                </span>
                {floorEnabled && <Check size={14} className="text-blue-600" />}
              </button>

              <button
                onClick={toggleSnap}
                className="w-full flex items-center justify-between px-2.5 py-2 text-left text-sm rounded-md text-slate-700 hover:bg-slate-100 transition-colors"
                role="menuitem"
              >
                <span className="flex items-center gap-2">
                  <Magnet size={16} />
                  Snapping {snapEnabled ? 'On' : 'Off'}
                </span>
                {snapEnabled && <Check size={14} className="text-blue-600" />}
              </button>

              <button
                onClick={handleReset}
                className="w-full flex items-center justify-between px-2.5 py-2 text-left text-sm rounded-md text-red-600 hover:bg-red-50 transition-colors"
                role="menuitem"
              >
                <span className="flex items-center gap-2">
                  <RotateCcw size={16} />
                  Reset Scene
                </span>
              </button>
            </div>
          )}
        </div>

        <div className="w-px h-6 bg-slate-200 mx-1 hidden sm:block" />

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

      {tool === 'auto-screw' && (
        <div className="absolute top-[4.1rem] left-1/2 -translate-x-1/2 z-20 w-[min(33rem,calc(100%-1rem))] rounded-xl border border-blue-200 bg-white/95 backdrop-blur shadow-lg px-3 py-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">Auto Screw Mode</div>
              <div className="mt-0.5 text-sm text-slate-700">
                {!autoScrewFirstPart
                  ? 'Step 1: Select your first wood piece.'
                  : `Step 2: Select the second piece to join with ${autoScrewFirstPart.name}.`}
              </div>
              {autoScrewStatus && (
                <div
                  className={`mt-1.5 text-xs ${
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
              className="shrink-0 inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 transition-colors"
              title="Exit Auto Screw Mode"
            >
              <X size={12} />
              Exit
            </button>
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
