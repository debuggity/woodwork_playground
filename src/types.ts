export type PartType = 'lumber' | 'sheet' | 'hardware';
export type HardwareKind = 'fastener' | 'hinge' | 'bracket' | 'slide' | 'handle' | 'dowel';

export type PartProfileType = 'rect' | 'l-cut' | 'polygon' | 'angled';
export type CutCorner = 'front-left' | 'front-right' | 'back-left' | 'back-right';

export interface PartProfile {
  type: PartProfileType;
  cutWidth?: number;
  cutDepth?: number;
  corner?: CutCorner;
  points?: [number, number][];
  startAngle?: number;
  endAngle?: number;
}

export interface HingeState {
  angle: number;
  minAngle?: number;
  maxAngle?: number;
  pinOffset?: number;
}

export interface HingeAttachment {
  hingeId: string;
  localPosition: [number, number, number];
  localRotation: [number, number, number];
}

export interface PartData {
  id: string;
  name: string;
  type: PartType;
  hardwareKind?: HardwareKind;
  dimensions: [number, number, number]; // width, height, depth (x, y, z)
  position: [number, number, number];
  rotation: [number, number, number];
  color?: string;
  texture?: string;
  profile?: PartProfile;
  hinge?: HingeState;
  attachment?: HingeAttachment;
}

export type ToolType = 'select' | 'move' | 'rotate' | 'delete';
