import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { PartData, ToolType } from './types';

interface AppState {
  parts: PartData[];
  selectedId: string | null;
  hoveredId: string | null;
  tool: ToolType;
  explodeFactor: number;
  
  addPart: (part: PartData) => void;
  updatePart: (id: string, updates: Partial<PartData>) => void;
  removePart: (id: string) => void;
  selectPart: (id: string | null) => void;
  setHoveredId: (id: string | null) => void;
  duplicatePart: (id: string) => void;
  setTool: (tool: ToolType) => void;
  resetScene: () => void;
  setParts: (parts: PartData[]) => void;
  snapEnabled: boolean;
  toggleSnap: () => void;
  floorEnabled: boolean;
  toggleFloor: () => void;
  setExplodeFactor: (value: number) => void;
}

export const useStore = create<AppState>((set) => ({
  parts: [],
  selectedId: null,
  hoveredId: null,
  tool: 'select',
  explodeFactor: 0,
  snapEnabled: true, // Default to true for easier alignment
  floorEnabled: false,

  addPart: (part) => set((state) => ({ 
    parts: [...state.parts, part],
    selectedId: part.id 
  })),

  updatePart: (id, updates) => set((state) => ({
    parts: state.parts.map((p) => (p.id === id ? { ...p, ...updates } : p)),
  })),

  removePart: (id) => set((state) => ({
    parts: state.parts.filter((p) => p.id !== id),
    selectedId: state.selectedId === id ? null : state.selectedId,
    hoveredId: state.hoveredId === id ? null : state.hoveredId,
  })),

  selectPart: (id) => set({ selectedId: id }),

  setHoveredId: (id) => set({ hoveredId: id }),

  duplicatePart: (id) => set((state) => {
    const partToDuplicate = state.parts.find((p) => p.id === id);
    if (!partToDuplicate) return {};

    const newPart: PartData = {
      ...partToDuplicate,
      id: uuidv4(),
      position: [
        partToDuplicate.position[0] + 5, 
        partToDuplicate.position[1], 
        partToDuplicate.position[2] + 5
      ],
    };

    return {
      parts: [...state.parts, newPart],
      selectedId: newPart.id,
    };
  }),

  setTool: (tool) => set({ tool }),

  resetScene: () => set({ parts: [], selectedId: null, hoveredId: null, explodeFactor: 0 }),

  setParts: (parts) => set({ parts, selectedId: null, hoveredId: null }),

  toggleSnap: () => set((state) => ({ snapEnabled: !state.snapEnabled })),

  toggleFloor: () => set((state) => ({ floorEnabled: !state.floorEnabled })),

  setExplodeFactor: (value) => set({ explodeFactor: Math.max(0, Math.min(1, value)) }),
}));
