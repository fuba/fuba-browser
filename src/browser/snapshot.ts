import { Page } from 'playwright';
import { SnapshotOptions, Snapshot, SnapshotNode } from '../types/snapshot.js';

export class SnapshotGenerator {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Update the page reference (used after browser reset).
   */
  setPage(page: Page): void {
    this.page = page;
  }

  async generate(options: SnapshotOptions = {}): Promise<Snapshot> {
    // Pass options as a serialized string to avoid TypeScript type checking issues
    // The code inside evaluate runs in the browser context
    const result = await this.page.evaluate(`
      (function() {
        const options = ${JSON.stringify(options)};
        const refs = {};
        let refCounter = 0;

        // ARIA roles that indicate interactive elements
        const INTERACTIVE_ROLES = new Set([
          'button', 'link', 'textbox', 'checkbox', 'radio', 'combobox',
          'listbox', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
          'option', 'switch', 'tab', 'searchbox', 'slider', 'spinbutton'
        ]);

        // HTML tags that are interactive by default
        const INTERACTIVE_TAGS = new Set([
          'a', 'button', 'input', 'select', 'textarea', 'details', 'summary'
        ]);

        function generateRef() {
          return 'e' + (++refCounter);
        }

        function getUniqueSelector(element) {
          if (element.id) return '#' + CSS.escape(element.id);

          const path = [];
          let current = element;

          while (current && current !== document.body) {
            let selector = current.tagName.toLowerCase();

            if (current.id) {
              selector = '#' + CSS.escape(current.id);
              path.unshift(selector);
              break;
            }

            const siblings = current.parentElement ?
              Array.from(current.parentElement.children).filter(e => e.tagName === current.tagName) : [];

            if (siblings.length > 1) {
              const index = siblings.indexOf(current) + 1;
              selector += ':nth-of-type(' + index + ')';
            }

            path.unshift(selector);
            current = current.parentElement;
          }

          return path.join(' > ') || element.tagName.toLowerCase();
        }

        function getAccessibleName(element) {
          // Check aria-label first
          const ariaLabel = element.getAttribute('aria-label');
          if (ariaLabel) return ariaLabel;

          // Check aria-labelledby
          const labelledBy = element.getAttribute('aria-labelledby');
          if (labelledBy) {
            const labelElement = document.getElementById(labelledBy);
            if (labelElement) return labelElement.textContent.trim();
          }

          // Check for associated label (input elements)
          if (element.id) {
            const label = document.querySelector('label[for="' + CSS.escape(element.id) + '"]');
            if (label) return label.textContent.trim();
          }

          // Check for wrapping label
          const wrappingLabel = element.closest('label');
          if (wrappingLabel && wrappingLabel !== element) {
            return wrappingLabel.textContent.trim();
          }

          // Check placeholder
          const placeholder = element.getAttribute('placeholder');
          if (placeholder) return placeholder;

          // Check title
          const title = element.getAttribute('title');
          if (title) return title;

          // Check alt for images
          const alt = element.getAttribute('alt');
          if (alt) return alt;

          // Check value for inputs
          if (element.value && ['button', 'submit', 'reset'].includes(element.type)) {
            return element.value;
          }

          // Use text content
          const text = element.textContent.trim();
          return text.substring(0, 100);
        }

        function getRole(element) {
          // Check explicit role
          const explicitRole = element.getAttribute('role');
          if (explicitRole) return explicitRole;

          // Implicit roles based on tag
          const tag = element.tagName.toLowerCase();

          const roleMap = {
            'a': element.href ? 'link' : 'generic',
            'button': 'button',
            'input': {
              'button': 'button',
              'submit': 'button',
              'reset': 'button',
              'checkbox': 'checkbox',
              'radio': 'radio',
              'text': 'textbox',
              'password': 'textbox',
              'email': 'textbox',
              'search': 'searchbox',
              'url': 'textbox',
              'tel': 'textbox',
              'number': 'spinbutton',
              'range': 'slider',
            },
            'select': 'combobox',
            'textarea': 'textbox',
            'img': 'img',
            'nav': 'navigation',
            'main': 'main',
            'header': 'banner',
            'footer': 'contentinfo',
            'aside': 'complementary',
            'article': 'article',
            'section': 'region',
            'form': 'form',
            'table': 'table',
            'ul': 'list',
            'ol': 'list',
            'li': 'listitem',
            'h1': 'heading',
            'h2': 'heading',
            'h3': 'heading',
            'h4': 'heading',
            'h5': 'heading',
            'h6': 'heading',
          };

          if (roleMap[tag]) {
            if (typeof roleMap[tag] === 'object') {
              return roleMap[tag][element.type] || 'textbox';
            }
            return roleMap[tag];
          }

          return 'generic';
        }

        function isInteractive(element, role) {
          if (INTERACTIVE_TAGS.has(element.tagName.toLowerCase())) return true;
          if (INTERACTIVE_ROLES.has(role)) return true;
          if (element.getAttribute('onclick')) return true;
          if (element.getAttribute('tabindex') !== null) return true;
          if (element.contentEditable === 'true') return true;
          return false;
        }

        function isFocusable(element) {
          const tabindex = element.getAttribute('tabindex');
          if (tabindex !== null && parseInt(tabindex) >= 0) return true;

          const focusableTags = ['a', 'button', 'input', 'select', 'textarea'];
          if (focusableTags.includes(element.tagName.toLowerCase())) {
            return !element.disabled;
          }

          return false;
        }

        function isVisible(element) {
          const style = window.getComputedStyle(element);
          if (style.display === 'none') return false;
          if (style.visibility === 'hidden') return false;
          if (style.opacity === '0') return false;

          const rect = element.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) return false;

          return true;
        }

        function isInViewport(element) {
          const rect = element.getBoundingClientRect();
          return (
            rect.top < window.innerHeight &&
            rect.bottom > 0 &&
            rect.left < window.innerWidth &&
            rect.right > 0
          );
        }

        function processElement(element, depth, maxDepth) {
          if (maxDepth !== undefined && depth > maxDepth) return null;
          if (!isVisible(element)) return null;

          const role = getRole(element);
          const interactive = isInteractive(element, role);

          // Skip non-interactive elements in interactive mode
          if (options.interactive && !interactive) {
            // But still process children
            const children = [];
            for (const child of element.children) {
              const childNode = processElement(child, depth + 1, maxDepth);
              if (childNode) {
                if (Array.isArray(childNode)) {
                  children.push(...childNode);
                } else {
                  children.push(childNode);
                }
              }
            }
            return children.length > 0 ? children : null;
          }

          const rect = element.getBoundingClientRect();
          const ref = generateRef();

          const node = {
            ref: ref,
            role: role,
            name: getAccessibleName(element),
            tag: element.tagName.toLowerCase(),
            selector: getUniqueSelector(element),
            bbox: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
            visible: isInViewport(element),
            focusable: isFocusable(element),
            attributes: {
              id: element.id || undefined,
              class: element.className || undefined,
              href: element.href || undefined,
              type: element.type || undefined,
              value: element.value || undefined,
              placeholder: element.placeholder || undefined,
              checked: element.checked !== undefined ? element.checked : undefined,
              disabled: element.disabled !== undefined ? element.disabled : undefined,
            },
            children: [],
          };

          // Store ref mapping
          refs[ref] = node;

          // Process children
          for (const child of element.children) {
            const childNode = processElement(child, depth + 1, maxDepth);
            if (childNode) {
              if (Array.isArray(childNode)) {
                node.children.push(...childNode);
              } else {
                node.children.push(childNode);
              }
            }
          }

          // Compact mode: remove nodes with no name and no children
          if (options.compact) {
            if (!node.name && node.children.length === 0 && !interactive) {
              return null;
            }
            // Flatten single-child non-interactive nodes
            if (!interactive && node.children.length === 1) {
              return node.children[0];
            }
          }

          // Remove empty children array
          if (node.children.length === 0) {
            delete node.children;
          }

          return node;
        }

        // Determine root element
        let root = document.body;
        if (options.selector) {
          const selected = document.querySelector(options.selector);
          if (selected) root = selected;
        }

        const tree = [];
        for (const child of root.children) {
          const node = processElement(child, 0, options.depth);
          if (node) {
            if (Array.isArray(node)) {
              tree.push(...node);
            } else {
              tree.push(node);
            }
          }
        }

        return {
          url: window.location.href,
          title: document.title,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
          },
          timestamp: new Date().toISOString(),
          tree: tree,
          refs: refs,
        };
      })()
    `);

    return result as Snapshot;
  }

  async findByRef(snapshot: Snapshot, ref: string): Promise<SnapshotNode | null> {
    // Normalize ref (remove @ prefix if present)
    const normalizedRef = ref.startsWith('@') ? ref.slice(1) : ref;
    return snapshot.refs[normalizedRef] || null;
  }
}
