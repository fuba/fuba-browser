// Snapshot types for accessibility tree representation

export interface SnapshotOptions {
  // Only include interactive elements
  interactive?: boolean;
  // Remove empty nodes
  compact?: boolean;
  // Maximum depth of the tree
  depth?: number;
  // Scope to a specific CSS selector
  selector?: string;
}

export interface SnapshotNode {
  // Unique reference ID for this element (e1, e2, ...)
  ref: string;
  // ARIA role or HTML tag role
  role: string;
  // Accessible name (aria-label, text content, etc.)
  name: string;
  // HTML tag name
  tag: string;
  // CSS selector to find this element
  selector: string;
  // Bounding box in viewport
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  // Whether element is visible in viewport
  visible: boolean;
  // Whether element is focusable
  focusable: boolean;
  // Additional attributes
  attributes: {
    id?: string;
    class?: string;
    href?: string;
    type?: string;
    value?: string;
    placeholder?: string;
    checked?: boolean;
    disabled?: boolean;
    [key: string]: string | boolean | undefined;
  };
  // Child nodes (tree structure)
  children?: SnapshotNode[];
}

export interface Snapshot {
  // URL of the page
  url: string;
  // Page title
  title: string;
  // Viewport dimensions
  viewport: {
    width: number;
    height: number;
  };
  // Timestamp when snapshot was taken
  timestamp: string;
  // Root node of the accessibility tree
  tree: SnapshotNode[];
  // Flat list of elements with refs for quick lookup
  refs: Record<string, SnapshotNode>;
}

export interface SnapshotRequest {
  interactive?: boolean;
  compact?: boolean;
  depth?: number;
  selector?: string;
}

export interface ActionRequest {
  // Ref ID (e.g., "e1", "@e1")
  ref: string;
  // Action to perform
  action: 'click' | 'dblclick' | 'hover' | 'focus' | 'fill' | 'type' | 'check' | 'uncheck' | 'select';
  // Value for fill/type/select actions
  value?: string;
}
