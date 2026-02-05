import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Vector3, Euler } from 'three';
import { useStore } from '../store';
import { PartData } from '../types';
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

export const Sidebar: React.FC = () => {
  const { addPart, parts, selectedId, updatePart, setTool, selectPart } = useStore();
  const selectedPart = parts.find((p) => p.id === selectedId);
  const [activeTab, setActiveTab] = useState<'library' | 'scene' | 'properties'>('library');
  const [searchTerm, setSearchTerm] = useState('');

  // Auto-switch to properties when a part is selected
  useEffect(() => {
    if (selectedId) {
      setActiveTab('properties');
    }
  }, [selectedId]);

  const handleAddPart = (partTemplate: typeof COMMON_PARTS[number]) => {
    setTool('select');
    
    const newPart: PartData = {
      id: uuidv4(),
      name: partTemplate.name,
      type: partTemplate.type as any,
      dimensions: [...partTemplate.dimensions] as [number, number, number],
      position: [0, partTemplate.dimensions[1] / 2, 0], // Place on ground
      rotation: [0, 0, 0],
      color: partTemplate.color,
    };
    addPart(newPart);
  };

  const updateDimension = (index: number, value: string) => {
    if (!selectedPart) return;
    const val = parseFloat(value);
    if (isNaN(val)) return;
    
    const newDimensions = [...selectedPart.dimensions] as [number, number, number];
    newDimensions[index] = val;
    updatePart(selectedPart.id, { dimensions: newDimensions });
  };

  const updatePosition = (index: number, value: string) => {
    if (!selectedPart) return;
    const val = parseFloat(value);
    if (isNaN(val)) return;
    
    const newPosition = [...selectedPart.position] as [number, number, number];
    newPosition[index] = val;
    updatePart(selectedPart.id, { position: newPosition });
  };

  const toDegrees = (rad: number) => Math.round(rad * (180 / Math.PI));
  const toRadians = (deg: number) => deg * (Math.PI / 180);

  const updateRotation = (index: number, value: string) => {
    if (!selectedPart) return;
    const val = parseFloat(value);
    if (isNaN(val)) return;
    
    const newRotation = [...selectedPart.rotation] as [number, number, number];
    newRotation[index] = toRadians(val);
    updatePart(selectedPart.id, { rotation: newRotation });
  };

  const rotate90 = (axisIndex: number) => {
    if (!selectedPart) return;
    const newRotation = [...selectedPart.rotation] as [number, number, number];
    newRotation[axisIndex] += (Math.PI / 2);
    updatePart(selectedPart.id, { rotation: newRotation });
  };

  const snapToFloor = () => {
    if (!selectedPart) return;

    const { dimensions, rotation } = selectedPart;
    const [w, h, d] = dimensions;
    const [rx, ry, rz] = rotation;

    // Create 8 corners of the unrotated box centered at (0,0,0)
    const corners = [
      new Vector3(w/2, h/2, d/2),
      new Vector3(w/2, h/2, -d/2),
      new Vector3(w/2, -h/2, d/2),
      new Vector3(w/2, -h/2, -d/2),
      new Vector3(-w/2, h/2, d/2),
      new Vector3(-w/2, h/2, -d/2),
      new Vector3(-w/2, -h/2, d/2),
      new Vector3(-w/2, -h/2, -d/2),
    ];

    const euler = new Euler(rx, ry, rz);
    let minY = Infinity;

    corners.forEach(corner => {
      corner.applyEuler(euler);
      if (corner.y < minY) {
        minY = corner.y;
      }
    });

    // The current lowest point relative to the center is minY
    // We want the new absolute lowest point to be 0 (or slightly above to avoid z-fighting if needed, but 0 is asked)
    // newPos.y + minY = 0 => newPos.y = -minY
    
    updatePart(selectedPart.id, { 
      position: [selectedPart.position[0], -minY, selectedPart.position[2]] 
    });
  };

  const filteredParts = parts.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="w-80 bg-white border-r border-slate-200 h-full flex flex-col z-10 overflow-hidden">
      
      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('library')}
          className={clsx(
            "flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors",
            activeTab === 'library' 
              ? "border-blue-500 text-blue-600 bg-blue-50/50" 
              : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          )}
        >
          <Hammer size={16} />
          Build
        </button>
        <button
          onClick={() => setActiveTab('scene')}
          className={clsx(
            "flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors",
            activeTab === 'scene' 
              ? "border-blue-500 text-blue-600 bg-blue-50/50" 
              : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          )}
        >
          <Layers size={16} />
          Scene
        </button>
        {selectedPart && (
          <button
            onClick={() => setActiveTab('properties')}
            className={clsx(
              "flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors",
              activeTab === 'properties' 
                ? "border-blue-500 text-blue-600 bg-blue-50/50" 
                : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
            )}
          >
            <Settings2 size={16} />
            Edit
          </button>
        )}
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        
        {/* BUILD / LIBRARY TAB */}
        {activeTab === 'library' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
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

        {/* SCENE / OUTLINER TAB */}
        {activeTab === 'scene' && (
          <div className="flex-1 flex flex-col">
            <div className="p-4 border-b border-slate-200 bg-slate-50">
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
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredParts.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">
                  No parts found
                </div>
              ) : (
                filteredParts.map((part) => (
                  <button
                    key={part.id}
                    onClick={() => selectPart(part.id)}
                    className={clsx(
                      "w-full flex items-center gap-3 p-2 rounded-md text-left text-sm transition-colors",
                      part.id === selectedId 
                        ? "bg-blue-100 text-blue-800 border border-blue-200" 
                        : "hover:bg-slate-100 text-slate-700 border border-transparent"
                    )}
                  >
                    <div className={clsx(
                      "w-8 h-8 rounded flex items-center justify-center shrink-0",
                      part.type === 'hardware' ? "bg-slate-200 text-slate-500" : "bg-orange-100 text-orange-600"
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
                        {part.position.map(n => Math.round(n)).join(', ')}
                      </div>
                    </div>
                    {part.id === selectedId && <MousePointer2 size={14} className="opacity-50" />}
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* EDIT / PROPERTIES TAB */}
        {activeTab === 'properties' && selectedPart && (
          <div className="flex-1 overflow-y-auto">
             <div className="p-4 border-b border-slate-200 bg-slate-50">
              <h2 className="font-semibold text-lg text-slate-800 flex items-center gap-2">
                <Box size={20} />
                Properties
              </h2>
              <div className="space-y-4 mt-4">
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
                          title="Rotate +90°"
                        >
                          +90°
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
                          title="Rotate +90°"
                        >
                          +90°
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
                          title="Rotate +90°"
                        >
                          +90°
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
            </div>
          </div>
        )}
      </div>
      
      <div className="p-4 border-t border-slate-200 bg-slate-50">
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