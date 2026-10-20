export type PenTool = 'pen' | 'pencil' | 'marker';
export type Tool = PenTool | 'eraser';

/** Points are flat [x, y, pressure, ...] in page units (page is PAGE_W units wide). */
export interface Stroke {
  id: string;
  tool: PenTool;
  color: string;
  points: number[];
}

/** y is the top of the text's first line in page units; it snaps to the current line height. */
export interface TextBlock {
  id: string;
  x: number;
  y: number;
  text: string;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface Note {
  id: string;
  created: number;
  updated: number;
  bookmarked: boolean;
  loc?: GeoPoint;
  blocks: TextBlock[];
  strokes: Stroke[];
}

export type PaperId = 'cream' | 'white' | 'blush' | 'sage' | 'midnight';
export type InkId = 'marine' | 'plum' | 'rust' | 'teal' | 'graphite';
export type PageStyle = 'lined' | 'grid' | 'dotted' | 'blank';
export type HandSize = 'S' | 'M' | 'L' | 'XL';
export type OpenWith = 'new' | 'recent' | 'nearby' | 'list';

export interface Settings {
  name: string;
  paper: PaperId;
  ink: InkId;
  pageStyle: PageStyle;
  font: string;
  size: HandSize;
  openWith: OpenWith;
  useLocation: boolean;
}
