import React, { useRef } from 'react';
import { useStore } from '../store';
import { MousePointer2, Move, RotateCw, Trash2, RotateCcw, Copy, Magnet, Download, Upload, Grid } from 'lucide-react';

export const Toolbar: React.FC = () => {
  const { tool, setTool, removePart, selectedId, resetScene, duplicatePart, snapEnabled, toggleSnap, parts, setParts, floorEnabled, toggleFloor } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDelete = () => {
    if (selectedId) {
      removePart(selectedId);
    }
  };

  const handleDuplicate = () => {
    if (selectedId) {
      duplicatePart(selectedId);
    }
  };

  const handleReset = () => {
    if (window.confirm('Are you sure you want to delete everything and reset the scene?')) {
      resetScene();
    }
  };

  const handleExport = () => {
    const data = JSON.stringify(parts, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wood-design.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const importedParts = JSON.parse(content);
          if (Array.isArray(importedParts)) {
            setParts(importedParts);
          } else {
            alert('Invalid file format: content is not an array of parts');
          }
        } catch (error) {
          console.error('Failed to parse file', error);
          alert('Invalid file format');
        }
      };
      reader.readAsText(file);
    }
    // Reset input value to allow re-selecting the same file
    event.target.value = '';
  };

  const tools = [
    { id: 'select', icon: MousePointer2, label: 'Select' },
    { id: 'move', icon: Move, label: 'Move' },
    { id: 'rotate', icon: RotateCw, label: 'Rotate' },
  ] as const;

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white rounded-lg shadow-lg p-2 flex items-center space-x-2 z-10">
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
      
      <div className="w-px h-6 bg-slate-200 mx-2" />

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

      <div className="w-px h-6 bg-slate-200 mx-2" />

      <button
        onClick={toggleSnap}
        className={`p-2 rounded-md transition-colors ${
          snapEnabled
            ? 'bg-blue-100 text-blue-600'
            : 'text-slate-600 hover:bg-slate-100'
        }`}
        title={snapEnabled ? "Snapping On" : "Snapping Off"}
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
        title={floorEnabled ? "Floor On" : "Floor Off"}
      >
        <Grid size={20} />
      </button>

      <div className="w-px h-6 bg-slate-200 mx-2" />

      <button
        onClick={handleExport}
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
  );
};
