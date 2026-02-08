import React, { useRef, useState } from 'react';
import { useStore } from '../store';
import { MousePointer2, Move, RotateCw, Trash2, RotateCcw, Copy, Magnet, Download, Upload, Grid, ChevronDown, ChevronUp } from 'lucide-react';

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
    snapEnabled,
    toggleSnap,
    parts,
    setParts,
    floorEnabled,
    toggleFloor,
    explodeFactor,
    setExplodeFactor,
  } = useStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportName, setExportName] = useState('wood-project');
  const [isStarkPanelMinimized, setIsStarkPanelMinimized] = useState(true);

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
  };

  const handleOpenExport = () => {
    setIsExportModalOpen(true);
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
      <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur rounded-lg shadow-lg p-2 flex flex-wrap items-center justify-center gap-1 sm:gap-2 z-20 max-w-[calc(100%-1rem)]">
        {tools.map((t) => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            className={`p-2 rounded-md transition-colors ${
              tool === t.id
                ? 'bg-blue-100 text-blue-600'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title={t.label}
          >
            <t.icon size={20} />
          </button>
        ))}

        <div className="w-px h-6 bg-slate-200 mx-1 hidden sm:block" />

        <button
          onClick={handleDelete}
          disabled={!selectedId}
          className={`p-2 rounded-md transition-colors ${
            !selectedId
              ? 'text-slate-300 cursor-not-allowed'
              : 'text-red-600 hover:bg-red-50'
          }`}
          title="Delete Selected"
        >
          <Trash2 size={20} />
        </button>

        <button
          onClick={handleDuplicate}
          disabled={!selectedId}
          className={`p-2 rounded-md transition-colors ${
            !selectedId
              ? 'text-slate-300 cursor-not-allowed'
              : 'text-blue-600 hover:bg-blue-50'
          }`}
          title="Duplicate Selected"
        >
          <Copy size={20} />
        </button>

        <button
          onClick={handleReset}
          className="p-2 rounded-md text-red-600 hover:bg-red-50 transition-colors border border-transparent hover:border-red-200"
          title="Reset Scene"
        >
          <RotateCcw size={20} />
        </button>

        <div className="w-px h-6 bg-slate-200 mx-1 hidden sm:block" />

        <button
          onClick={toggleSnap}
          className={`p-2 rounded-md transition-colors ${
            snapEnabled
              ? 'bg-blue-100 text-blue-600'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
          title={snapEnabled ? 'Snapping On' : 'Snapping Off'}
        >
          <Magnet size={20} />
        </button>

        <button
          onClick={toggleFloor}
          className={`p-2 rounded-md transition-colors ${
            floorEnabled
              ? 'bg-blue-100 text-blue-600'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
          title={floorEnabled ? 'Floor On' : 'Floor Off'}
        >
          <Grid size={20} />
        </button>

        <div className="w-px h-6 bg-slate-200 mx-1 hidden sm:block" />

        <button
          onClick={handleOpenExport}
          className="p-2 rounded-md text-slate-600 hover:bg-slate-100 transition-colors"
          title="Save Design"
        >
          <Download size={20} />
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-2 rounded-md text-slate-600 hover:bg-slate-100 transition-colors"
          title="Load Design"
        >
          <Upload size={20} />
        </button>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImport}
          accept=".json"
          className="hidden"
        />
      </div>

      <div
        className="fixed z-20"
        style={{
          right: 'calc(env(safe-area-inset-right, 0px) + 0.75rem)',
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)',
        }}
      >
        {isStarkPanelMinimized ? (
          <button
            onClick={() => setIsStarkPanelMinimized(false)}
            className="h-14 w-14 rounded-xl border border-cyan-300/50 bg-slate-950/85 shadow-[0_0_30px_rgba(34,211,238,0.22)] backdrop-blur-md text-cyan-100 hover:text-white hover:border-cyan-200/70 transition-colors flex items-center justify-center"
            title="Open Tony Stark Slider"
          >
            <div className="text-center leading-none">
              <div className="text-[10px] font-bold tracking-wide">TS</div>
              <ChevronUp size={14} className="mx-auto mt-0.5" />
            </div>
          </button>
        ) : (
          <div className="w-[min(24rem,calc(100vw-1rem))] rounded-xl border border-cyan-300/50 bg-slate-950/80 shadow-[0_0_40px_rgba(34,211,238,0.22)] backdrop-blur-md p-3">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.22em] text-cyan-300">
              <span>Stark Assembly Matrix</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-cyan-100">{explodeFactor.toFixed(2)}</span>
                <button
                  onClick={() => setIsStarkPanelMinimized(true)}
                  className="p-1 rounded text-cyan-200 hover:text-white hover:bg-cyan-500/15 transition-colors"
                  title="Minimize Tony Stark Slider"
                >
                  <ChevronDown size={14} />
                </button>
              </div>
            </div>
            <div className="mt-1 text-sm font-semibold text-cyan-50">
              Tony Stark Slider
            </div>
            <div className="mt-2 px-1">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={explodeFactor}
                onChange={(e) => setExplodeFactor(parseFloat(e.target.value))}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-slate-800 accent-cyan-400"
                aria-label="Tony Stark explosion slider"
              />
              <div className="mt-1 flex justify-between text-[10px] font-mono text-cyan-200/90">
                <span>0.00 NORMAL</span>
                <span>1.00 FULL EXPLODE</span>
              </div>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-500 transition-[width] duration-150"
                style={{ width: `${explodeFactor * 100}%` }}
              />
            </div>
            <div className="mt-2 text-[11px] text-cyan-100/80">
              Deconstruct and reassemble like you own a billion-dollar workshop.
            </div>
          </div>
        )}
      </div>

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
