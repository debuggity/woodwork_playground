export type PartType = 'lumber' | 'sheet' | 'hardware';

export interface PartData {
  id: string;
  name: string;
  type: PartType;
  dimensions: [number, number, number]; // width, height, depth (x, y, z)
  position: [number, number, number];
  rotation: [number, number, number];
  color?: string;
  texture?: string;
}

export type ToolType = 'select' | 'move' | 'rotate' | 'delete';
