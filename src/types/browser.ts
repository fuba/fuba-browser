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

export interface PdfExportOptions {
  // Page layout options
  landscape?: boolean;
  printBackground?: boolean;
  scale?: number;

  // Paper size options (in microns, default A4)
  paperWidth?: number;
  paperHeight?: number;

  // Margin options (in microns)
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;

  // Page range (e.g., "1-5, 8, 11-13")
  pageRanges?: string;

  // Timestamp options
  timestamp?: {
    enabled: boolean;
    format?: string;         // Date format (default: "YYYY-MM-DD HH:mm:ss")
    position?: 'header' | 'footer';
    align?: 'left' | 'center' | 'right';
  };

  // Header/Footer options
  displayHeaderFooter?: boolean;
  headerTemplate?: string;
  footerTemplate?: string;
}

export interface PdfExportResult {
  success: boolean;
  size: number;
  url: string;
  title: string;
  timestamp?: string;
}

// Browser state for saving/loading authentication
export interface BrowserState {
  version: string;
  timestamp: string;
  url: string;
  cookies: Electron.Cookie[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
}