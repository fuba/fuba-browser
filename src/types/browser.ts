export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementAttributes {
  id?: string;
  class?: string;
  href?: string;
  type?: string;
  role?: string;
  [key: string]: any;
}

export interface ElementInfo {
  tagName: string;
  selector: string;
  text: string;
  bbox: BoundingBox;
  attributes: ElementAttributes;
  isVisible: boolean;
  areaPercentage: number;
}

export interface PageContent {
  html: string;
  markdown: string;
  elements: ElementInfo[];
  url: string;
  title: string;
}

export interface NavigateRequest {
  url: string;
}

export interface ScrollRequest {
  x?: number;
  y?: number;
}

export interface ClickRequest {
  selector: string;
}

export interface TypeRequest {
  selector: string;
  text: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}