export type PartType = 'lumber' | 'sheet' | 'hardware';

export type PartProfileType = 'rect' | 'l-cut' | 'polygon';
export type CutCorner = 'front-left' | 'front-right' | 'back-left' | 'back-right';

export interface PartProfile {
  type: PartProfileType;
  cutWidth?: number;
  cutDepth?: number;
  corner?: CutCorner;
  points?: [number, number][];
}

export interface PartData {
  id: string;
  name: string;
  type: PartType;
  dimensions: [number, number, number]; // width, height, depth (x, y, z)
  position: [number, number, number];
  rotation: [number, number, number];
  color?: string;
  texture?: string;
  profile?: PartProfile;
}

export type ToolType = 'select' | 'move' | 'rotate' | 'delete';
