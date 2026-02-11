import TurndownService from 'turndown';
import { ElementInfo } from '../types/browser.js';

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-'
});

type BoundingRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function getSafeBoundingRect(node: Node): BoundingRect | null {
  const maybeElement = node as Partial<Element> & {
    getBoundingClientRect?: () => Partial<BoundingRect>;
  };

  if (typeof maybeElement.getBoundingClientRect !== 'function') {
    return null;
  }

  const rect = maybeElement.getBoundingClientRect();
  if (
    typeof rect.x !== 'number' ||
    typeof rect.y !== 'number' ||
    typeof rect.width !== 'number' ||
    typeof rect.height !== 'number'
  ) {
    return null;
  }

  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height
  };
}

// Custom rules for enhanced markdown
turndownService.addRule('interactiveElements', {
  filter: (node: Node) => {
    const tagName = node.nodeName.toLowerCase();
    return ['a', 'button', 'input', 'select', 'textarea'].includes(tagName);
  },
  replacement: (content: string, node: Node) => {
    const element = node as HTMLElement;
    const tagName = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : '';
    const className = typeof element.className === 'string' ? element.className : '';
    const classes = className ? `.${className.split(' ').join('.')}` : '';
    const selector = id || classes || tagName;
    
    // Read layout info only when the DOM implementation provides it.
    const rect = getSafeBoundingRect(node);
    const coords = rect ? `[${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)}x${Math.round(rect.height)}]` : '';
    
    switch (tagName) {
      case 'a':
        const href = element.getAttribute('href') || '#';
        return `[${content}](${href} "${selector} ${coords}")`;
      case 'button':
        return `[BUTTON: ${content}]<!--${selector} ${coords}-->`;
      case 'input':
        const type = element.getAttribute('type') || 'text';
        const placeholder = element.getAttribute('placeholder') || '';
        return `[INPUT:${type}${placeholder ? ` "${placeholder}"` : ''}]<!--${selector} ${coords}-->`;
      case 'select':
        return `[SELECT: ${content}]<!--${selector} ${coords}-->`;
      case 'textarea':
        return `[TEXTAREA]<!--${selector} ${coords}-->`;
      default:
        return content;
    }
  }
});

export async function convertToMarkdown(html: string, elements: ElementInfo[]): Promise<string> {
  // Create a map of elements by selector for quick lookup
  const elementMap = new Map<string, ElementInfo>();
  elements.forEach(el => {
    elementMap.set(el.selector, el);
  });
  
  // Convert HTML to markdown
  let markdown = turndownService.turndown(html);
  
  // Enhance markdown with element information
  elements.forEach(el => {
    if (el.areaPercentage >= 3) {
      // Add section markers for large elements
      const marker = `\n<!-- SECTION: ${el.selector} [${Math.round(el.bbox.x)},${Math.round(el.bbox.y)},${Math.round(el.bbox.width)}x${Math.round(el.bbox.height)}] ${el.areaPercentage.toFixed(1)}% -->\n`;
      markdown = markdown.replace(new RegExp(el.text.substring(0, 20), 'g'), marker + el.text);
    }
  });
  
  return markdown;
}
