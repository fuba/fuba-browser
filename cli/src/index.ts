#!/usr/bin/env node

import { Command } from 'commander';
import { FubaClient } from './client.js';
import { setOutputOptions, success, error, output, raw, info } from './output.js';
import { writeFileSync, readFileSync, existsSync } from 'fs';

const program = new Command();

// Global client instance
let client: FubaClient;

// Show brief help when no arguments provided
function showBriefHelp(): void {
  console.log(`fbb - CLI for fuba-browser automation

Usage: fbb [options] <command>

Quick Start:
  fbb open <url>              Navigate to a URL
  fbb snapshot -i             Get interactive elements
  fbb click <selector>        Click an element (@ref or CSS)
  fbb fill <selector> <text>  Fill text into an element
  fbb screenshot [path]       Take a screenshot
  fbb docs --llm --raw        Get LLM-ready docs bundle

Common Commands:
  Navigation:   open, snapshot
  Interaction:  click, type, fill, hover, scroll
  Information:  get title|url|text, docs
  Wait:         wait selector|text|url|load
  State:        state save|load|info, cookies, storage
  VNC:          vnc [--vnc-host host:port]
  System:       health, reset

Options:
  --host <host>   API host (default: localhost)
  --port <port>   API port (default: 39000)
  --json          Output in JSON format
  -h, --help      Show full help

Run 'fbb --help' for all commands, or 'fbb <command> --help' for command details.
`);
}

program
  .name('fbb')
  .description('CLI for fuba-browser automation')
  .version('0.1.0')
  .option('--host <host>', 'API host', 'localhost')
  .option('--port <port>', 'API port', '39000')
  .option('--timeout <ms>', 'Request timeout in milliseconds', '30000')
  .option('--json', 'Output in JSON format')
  .option('--debug', 'Enable debug output')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    setOutputOptions({ json: opts.json, debug: opts.debug });
    client = new FubaClient({
      host: opts.host,
      port: parseInt(opts.port),
      timeout: parseInt(opts.timeout),
    });
  });

// open (navigate to URL)
program
  .command('open <url>')
  .alias('goto')
  .alias('navigate')
  .description('Navigate to a URL')
  .action(async (url: string) => {
    const result = await client.open(url);
    if (result.success) {
      success(`Navigated to ${url}`);
    } else {
      error('Failed to navigate', result.error);
    }
  });

// snapshot
program
  .command('snapshot')
  .description('Get page accessibility snapshot with element refs')
  .option('-i, --interactive', 'Only include interactive elements')
  .option('-c, --compact', 'Remove empty nodes')
  .option('-d, --depth <number>', 'Maximum tree depth')
  .option('-s, --selector <selector>', 'Scope to a CSS selector')
  .action(async (options) => {
    const result = await client.snapshot({
      interactive: options.interactive,
      compact: options.compact,
      depth: options.depth ? parseInt(options.depth) : undefined,
      selector: options.selector,
    });
    if (result.success) {
      output(result.data);
    } else {
      error('Failed to get snapshot', result.error);
    }
  });

// click
program
  .command('click <selector>')
  .description('Click an element (CSS selector or @ref)')
  .action(async (selector: string) => {
    const result = await client.click(selector);
    if (result.success) {
      success(`Clicked ${selector}`);
    } else {
      error('Failed to click', result.error);
    }
  });

// dblclick
program
  .command('dblclick <selector>')
  .description('Double-click an element')
  .action(async (selector: string) => {
    const result = await client.action(selector, 'dblclick');
    if (result.success) {
      success(`Double-clicked ${selector}`);
    } else {
      error('Failed to double-click', result.error);
    }
  });

// type
program
  .command('type <selector> <text>')
  .description('Type text into an element')
  .action(async (selector: string, text: string) => {
    const result = await client.type(selector, text);
    if (result.success) {
      success(`Typed "${text}" into ${selector}`);
    } else {
      error('Failed to type', result.error);
    }
  });

// fill
program
  .command('fill <selector> <text>')
  .description('Clear and fill text into an element')
  .action(async (selector: string, text: string) => {
    const result = await client.fill(selector, text);
    if (result.success) {
      success(`Filled "${text}" into ${selector}`);
    } else {
      error('Failed to fill', result.error);
    }
  });

// hover
program
  .command('hover <selector>')
  .description('Hover over an element')
  .action(async (selector: string) => {
    const result = await client.hover(selector);
    if (result.success) {
      success(`Hovered over ${selector}`);
    } else {
      error('Failed to hover', result.error);
    }
  });

// focus
program
  .command('focus <selector>')
  .description('Focus an element')
  .action(async (selector: string) => {
    const result = await client.focus(selector);
    if (result.success) {
      success(`Focused ${selector}`);
    } else {
      error('Failed to focus', result.error);
    }
  });

// check
program
  .command('check <selector>')
  .description('Check a checkbox')
  .action(async (selector: string) => {
    const result = await client.check(selector);
    if (result.success) {
      success(`Checked ${selector}`);
    } else {
      error('Failed to check', result.error);
    }
  });

// uncheck
program
  .command('uncheck <selector>')
  .description('Uncheck a checkbox')
  .action(async (selector: string) => {
    const result = await client.uncheck(selector);
    if (result.success) {
      success(`Unchecked ${selector}`);
    } else {
      error('Failed to uncheck', result.error);
    }
  });

// select
program
  .command('select <selector> <value>')
  .description('Select an option in a dropdown')
  .action(async (selector: string, value: string) => {
    const result = await client.select(selector, value);
    if (result.success) {
      success(`Selected "${value}" in ${selector}`);
    } else {
      error('Failed to select', result.error);
    }
  });

// scroll
program
  .command('scroll <direction> [pixels]')
  .description('Scroll the page (up/down/left/right or x,y)')
  .action(async (direction: string, pixels?: string) => {
    const result = await client.scroll(direction, pixels ? parseInt(pixels) : 100);
    if (result.success) {
      success(`Scrolled ${direction}`);
    } else {
      error('Failed to scroll', result.error);
    }
  });

// screenshot
program
  .command('screenshot [path]')
  .description('Take a screenshot')
  .option('-s, --selector <selector>', 'Capture specific element')
  .action(async (path?: string, options?: { selector?: string }) => {
    const result = await client.screenshot(options?.selector);
    if (result.success && result.data) {
      if (path) {
        writeFileSync(path, result.data as Buffer);
        success(`Screenshot saved to ${path}${options?.selector ? ` (element: ${options.selector})` : ''}`);
      } else {
        raw(result.data as Buffer);
      }
    } else {
      error('Failed to take screenshot', result.error);
    }
  });

// get subcommand
const getCmd = program.command('get').description('Get information from page');

getCmd
  .command('title')
  .description('Get page title')
  .action(async () => {
    const result = await client.getTitle();
    if (result.success && result.data) {
      output(result.data.title);
    } else {
      error('Failed to get title', result.error);
    }
  });

getCmd
  .command('url')
  .description('Get current URL')
  .action(async () => {
    const result = await client.getUrl();
    if (result.success && result.data) {
      output(result.data.url);
    } else {
      error('Failed to get URL', result.error);
    }
  });

// content
program
  .command('content')
  .description('Get page content (HTML, markdown, elements)')
  .action(async () => {
    const result = await client.content();
    if (result.success) {
      output(result.data);
    } else {
      error('Failed to get content', result.error);
    }
  });

// elements
program
  .command('elements')
  .description('Get interactive elements')
  .action(async () => {
    const result = await client.elements();
    if (result.success) {
      output(result.data);
    } else {
      error('Failed to get elements', result.error);
    }
  });

// docs
program
  .command('docs [docId]')
  .description('Get documentation for LLM usage (index, single doc, or bundled docs)')
  .option('-l, --llm', 'Get bundled docs for LLM ingestion')
  .option('--docs <ids>', 'Comma-separated doc IDs for list/filter (e.g. api,cli,usage)')
  .option('-r, --raw', 'Output markdown only (single doc or --llm)')
  .action(async (docId: string | undefined, options: { llm?: boolean; docs?: string; raw?: boolean }) => {
    const docIds = options.docs
      ? options.docs.split(',').map((id) => id.trim()).filter((id) => id.length > 0)
      : undefined;

    if (options.llm) {
      const result = await client.docsBundle(docIds);
      if (result.success && result.data) {
        if (options.raw) {
          raw(result.data.markdown);
        } else {
          output(result.data);
        }
      } else {
        error('Failed to get bundled docs', result.error);
      }
      return;
    }

    if (docId) {
      const result = await client.docsDocument(docId);
      if (result.success && result.data) {
        if (options.raw) {
          raw(result.data.markdown);
        } else {
          output(result.data);
        }
      } else {
        error('Failed to get document', result.error);
      }
      return;
    }

    const result = await client.docsIndex(docIds);
    if (result.success) {
      output(result.data);
    } else {
      error('Failed to get docs index', result.error);
    }
  });

// cookies
const cookiesCmd = program.command('cookies').description('Manage cookies');

cookiesCmd
  .command('list')
  .alias('ls')
  .description('List all cookies')
  .action(async () => {
    const result = await client.cookies();
    if (result.success) {
      output(result.data);
    } else {
      error('Failed to get cookies', result.error);
    }
  });

cookiesCmd
  .command('clear')
  .description('Clear all cookies')
  .action(async () => {
    const result = await client.clearCookies();
    if (result.success) {
      success('Cookies cleared');
    } else {
      error('Failed to clear cookies', result.error);
    }
  });

// health
program
  .command('health')
  .description('Check API server health')
  .action(async () => {
    const result = await client.health();
    if (result.success) {
      info(`Server is healthy (version ${(result.data as { version: string }).version})`);
    } else {
      error('Server is not responding', result.error);
    }
  });

// reset
program
  .command('reset')
  .description('Reset browser (restart Chromium process)')
  .action(async () => {
    info('Resetting browser...');
    const result = await client.post('/api/reset', {});
    if (result.success) {
      success('Browser has been reset');
    } else {
      error('Failed to reset browser', result.error);
    }
  });

// vnc (generate noVNC access URL)
program
  .command('vnc')
  .description('Generate a one-time noVNC access URL')
  .option('--vnc-host <host:port>', 'VNC host:port for redirect (e.g. puma2:39101)')
  .action(async (options) => {
    const result = await client.vncToken(options.vncHost);
    if (result.success && result.data) {
      const url = `${client.getBaseUrl()}/web-vnc?token=${result.data.token}`;
      output(url);
      info(`Expires at: ${result.data.expiresAt}`);
    } else {
      error('Failed to generate VNC URL', result.error);
    }
  });

// ===== Wait commands =====
const waitCmd = program.command('wait').description('Wait for conditions');

waitCmd
  .command('selector <selector>')
  .description('Wait for element to appear')
  .option('-t, --timeout <ms>', 'Timeout in milliseconds', '30000')
  .action(async (selector: string, options) => {
    const result = await client.post('/api/wait/selector', {
      selector,
      timeout: parseInt(options.timeout),
    });
    if (result.success) {
      success(`Element ${selector} found`);
    } else {
      error('Wait timeout', result.error);
    }
  });

waitCmd
  .command('text <text>')
  .description('Wait for text to appear')
  .option('-s, --selector <selector>', 'Scope to selector')
  .option('-t, --timeout <ms>', 'Timeout in milliseconds', '30000')
  .action(async (text: string, options) => {
    const result = await client.post('/api/wait/text', {
      text,
      selector: options.selector,
      timeout: parseInt(options.timeout),
    });
    if (result.success) {
      success(`Text "${text}" found`);
    } else {
      error('Wait timeout', result.error);
    }
  });

waitCmd
  .command('url <pattern>')
  .description('Wait for URL to match pattern')
  .option('-t, --timeout <ms>', 'Timeout in milliseconds', '30000')
  .action(async (pattern: string, options) => {
    const result = await client.post('/api/wait/url', {
      pattern,
      timeout: parseInt(options.timeout),
    });
    if (result.success) {
      success(`URL matched ${pattern}`);
    } else {
      error('Wait timeout', result.error);
    }
  });

waitCmd
  .command('load [state]')
  .description('Wait for page load (load|domcontentloaded|networkidle)')
  .option('-t, --timeout <ms>', 'Timeout in milliseconds', '30000')
  .action(async (state: string = 'load', options) => {
    const result = await client.post('/api/wait/load', {
      state,
      timeout: parseInt(options.timeout),
    });
    if (result.success) {
      success(`Page loaded (${state})`);
    } else {
      error('Wait timeout', result.error);
    }
  });

waitCmd
  .command('timeout <ms>')
  .alias('delay')
  .description('Wait for specified milliseconds')
  .action(async (ms: string) => {
    const result = await client.post('/api/wait/timeout', {
      ms: parseInt(ms),
    });
    if (result.success) {
      success(`Waited ${ms}ms`);
    } else {
      error('Wait failed', result.error);
    }
  });

// ===== Keyboard commands =====
program
  .command('press <key>')
  .alias('key')
  .description('Press a keyboard key')
  .action(async (key: string) => {
    const result = await client.post('/api/keyboard/press', { key });
    if (result.success) {
      success(`Pressed ${key}`);
    } else {
      error('Failed to press key', result.error);
    }
  });

program
  .command('keydown <key>')
  .description('Hold down a key')
  .action(async (key: string) => {
    const result = await client.post('/api/keyboard/down', { key });
    if (result.success) {
      success(`Key down: ${key}`);
    } else {
      error('Failed', result.error);
    }
  });

program
  .command('keyup <key>')
  .description('Release a key')
  .action(async (key: string) => {
    const result = await client.post('/api/keyboard/up', { key });
    if (result.success) {
      success(`Key up: ${key}`);
    } else {
      error('Failed', result.error);
    }
  });

// ===== Mouse commands =====
const mouseCmd = program.command('mouse').description('Mouse control');

mouseCmd
  .command('move <x> <y>')
  .description('Move mouse to position')
  .action(async (x: string, y: string) => {
    const result = await client.post('/api/mouse/move', {
      x: parseInt(x),
      y: parseInt(y),
    });
    if (result.success) {
      success(`Mouse moved to (${x}, ${y})`);
    } else {
      error('Failed', result.error);
    }
  });

mouseCmd
  .command('down [button]')
  .description('Press mouse button (left|right|middle)')
  .action(async (button: string = 'left') => {
    const result = await client.post('/api/mouse/down', { button });
    if (result.success) {
      success(`Mouse ${button} down`);
    } else {
      error('Failed', result.error);
    }
  });

mouseCmd
  .command('up [button]')
  .description('Release mouse button')
  .action(async (button: string = 'left') => {
    const result = await client.post('/api/mouse/up', { button });
    if (result.success) {
      success(`Mouse ${button} up`);
    } else {
      error('Failed', result.error);
    }
  });

mouseCmd
  .command('wheel <deltaY> [deltaX]')
  .description('Scroll with mouse wheel')
  .action(async (deltaY: string, deltaX: string = '0') => {
    const result = await client.post('/api/mouse/wheel', {
      deltaY: parseInt(deltaY),
      deltaX: parseInt(deltaX),
    });
    if (result.success) {
      success(`Mouse wheel scrolled`);
    } else {
      error('Failed', result.error);
    }
  });

// ===== Storage commands =====
const storageCmd = program.command('storage').description('Manage web storage');

// localStorage
const localCmd = storageCmd.command('local').description('Manage localStorage');

localCmd
  .command('list')
  .alias('ls')
  .description('List all localStorage items')
  .action(async () => {
    const result = await client.get('/api/storage/local');
    if (result.success) {
      output(result.data);
    } else {
      error('Failed', result.error);
    }
  });

localCmd
  .command('get <key>')
  .description('Get localStorage item')
  .action(async (key: string) => {
    const result = await client.get(`/api/storage/local/${encodeURIComponent(key)}`);
    if (result.success) {
      output((result.data as { value: string }).value);
    } else {
      error('Failed', result.error);
    }
  });

localCmd
  .command('set <key> <value>')
  .description('Set localStorage item')
  .action(async (key: string, value: string) => {
    const result = await client.post('/api/storage/local', { key, value });
    if (result.success) {
      success(`Set ${key}`);
    } else {
      error('Failed', result.error);
    }
  });

localCmd
  .command('delete <key>')
  .alias('rm')
  .description('Delete localStorage item')
  .action(async (key: string) => {
    const result = await client.delete(`/api/storage/local/${encodeURIComponent(key)}`);
    if (result.success) {
      success(`Deleted ${key}`);
    } else {
      error('Failed', result.error);
    }
  });

localCmd
  .command('clear')
  .description('Clear all localStorage')
  .action(async () => {
    const result = await client.delete('/api/storage/local');
    if (result.success) {
      success('localStorage cleared');
    } else {
      error('Failed', result.error);
    }
  });

// sessionStorage
const sessionCmd = storageCmd.command('session').description('Manage sessionStorage');

sessionCmd
  .command('list')
  .alias('ls')
  .description('List all sessionStorage items')
  .action(async () => {
    const result = await client.get('/api/storage/session');
    if (result.success) {
      output(result.data);
    } else {
      error('Failed', result.error);
    }
  });

sessionCmd
  .command('get <key>')
  .description('Get sessionStorage item')
  .action(async (key: string) => {
    const result = await client.get(`/api/storage/session/${encodeURIComponent(key)}`);
    if (result.success) {
      output((result.data as { value: string }).value);
    } else {
      error('Failed', result.error);
    }
  });

sessionCmd
  .command('set <key> <value>')
  .description('Set sessionStorage item')
  .action(async (key: string, value: string) => {
    const result = await client.post('/api/storage/session', { key, value });
    if (result.success) {
      success(`Set ${key}`);
    } else {
      error('Failed', result.error);
    }
  });

sessionCmd
  .command('clear')
  .description('Clear all sessionStorage')
  .action(async () => {
    const result = await client.delete('/api/storage/session');
    if (result.success) {
      success('sessionStorage cleared');
    } else {
      error('Failed', result.error);
    }
  });

// ===== Debug commands =====
program
  .command('eval <script>')
  .description('Execute JavaScript in the page')
  .action(async (script: string) => {
    const result = await client.post('/api/eval', { script });
    if (result.success) {
      output((result.data as { result: unknown }).result);
    } else {
      error('Eval failed', result.error);
    }
  });

program
  .command('highlight <selector>')
  .description('Highlight an element (visual debug)')
  .action(async (selector: string) => {
    const result = await client.post('/api/highlight', { selector });
    if (result.success) {
      success(`Highlighted ${selector} for 3 seconds`);
    } else {
      error('Failed to highlight', result.error);
    }
  });

program
  .command('console')
  .description('Get console messages')
  .option('--clear', 'Clear console messages')
  .action(async (options) => {
    if (options.clear) {
      const result = await client.delete('/api/console');
      if (result.success) {
        success('Console cleared');
      } else {
        error('Failed', result.error);
      }
    } else {
      const result = await client.get('/api/console');
      if (result.success) {
        output(result.data);
      } else {
        error('Failed', result.error);
      }
    }
  });

program
  .command('errors')
  .description('Get page errors')
  .option('--clear', 'Clear errors')
  .action(async (options) => {
    if (options.clear) {
      const result = await client.delete('/api/errors');
      if (result.success) {
        success('Errors cleared');
      } else {
        error('Failed', result.error);
      }
    } else {
      const result = await client.get('/api/errors');
      if (result.success) {
        output(result.data);
      } else {
        error('Failed', result.error);
      }
    }
  });

// ===== Extended get commands =====
getCmd
  .command('text <selector>')
  .description('Get text content of element')
  .action(async (selector: string) => {
    const result = await client.get(`/api/get/text/${encodeURIComponent(selector)}`);
    if (result.success) {
      output((result.data as { text: string }).text);
    } else {
      error('Failed', result.error);
    }
  });

getCmd
  .command('html <selector>')
  .description('Get innerHTML of element')
  .action(async (selector: string) => {
    const result = await client.get(`/api/get/html/${encodeURIComponent(selector)}`);
    if (result.success) {
      output((result.data as { html: string }).html);
    } else {
      error('Failed', result.error);
    }
  });

getCmd
  .command('value <selector>')
  .description('Get value of input element')
  .action(async (selector: string) => {
    const result = await client.get(`/api/get/value/${encodeURIComponent(selector)}`);
    if (result.success) {
      output((result.data as { value: string }).value);
    } else {
      error('Failed', result.error);
    }
  });

getCmd
  .command('attr <selector> <attribute>')
  .description('Get attribute of element')
  .action(async (selector: string, attribute: string) => {
    const result = await client.get(`/api/get/attr/${encodeURIComponent(selector)}/${encodeURIComponent(attribute)}`);
    if (result.success) {
      output((result.data as { value: string }).value);
    } else {
      error('Failed', result.error);
    }
  });

getCmd
  .command('count <selector>')
  .description('Get count of matching elements')
  .action(async (selector: string) => {
    const result = await client.get(`/api/get/count/${encodeURIComponent(selector)}`);
    if (result.success) {
      output((result.data as { count: number }).count);
    } else {
      error('Failed', result.error);
    }
  });

getCmd
  .command('box <selector>')
  .description('Get bounding box of element')
  .action(async (selector: string) => {
    const result = await client.get(`/api/get/box/${encodeURIComponent(selector)}`);
    if (result.success) {
      output((result.data as { box: object }).box);
    } else {
      error('Failed', result.error);
    }
  });

// ===== Is commands =====
const isCmd = program.command('is').description('Check element state');

isCmd
  .command('visible <selector>')
  .description('Check if element is visible')
  .action(async (selector: string) => {
    const result = await client.post('/api/is/visible', { selector });
    if (result.success) {
      const visible = (result.data as { visible: boolean }).visible;
      output(visible);
      if (!visible) process.exit(1);
    } else {
      error('Failed', result.error);
    }
  });

isCmd
  .command('enabled <selector>')
  .description('Check if element is enabled')
  .action(async (selector: string) => {
    const result = await client.post('/api/is/enabled', { selector });
    if (result.success) {
      const enabled = (result.data as { enabled: boolean }).enabled;
      output(enabled);
      if (!enabled) process.exit(1);
    } else {
      error('Failed', result.error);
    }
  });

isCmd
  .command('checked <selector>')
  .description('Check if checkbox is checked')
  .action(async (selector: string) => {
    const result = await client.post('/api/is/checked', { selector });
    if (result.success) {
      const checked = (result.data as { checked: boolean }).checked;
      output(checked);
      if (!checked) process.exit(1);
    } else {
      error('Failed', result.error);
    }
  });

// ===== State commands =====
const stateCmd = program.command('state').description('Manage browser authentication state');

stateCmd
  .command('save <path>')
  .description('Save browser state (cookies, localStorage, sessionStorage) to file')
  .action(async (path: string) => {
    const result = await client.post('/api/state/save', {});
    if (result.success) {
      const state = result.data;
      writeFileSync(path, JSON.stringify(state, null, 2));
      const data = result.data as {
        cookies: unknown[];
        localStorage: Record<string, string>;
        sessionStorage: Record<string, string>;
        url: string;
      };
      success(`State saved to ${path}`);
      info(`  URL: ${data.url}`);
      info(`  Cookies: ${data.cookies.length}`);
      info(`  localStorage: ${Object.keys(data.localStorage).length} items`);
      info(`  sessionStorage: ${Object.keys(data.sessionStorage).length} items`);
    } else {
      error('Failed to save state', result.error);
    }
  });

stateCmd
  .command('load <path>')
  .description('Load browser state from file')
  .option('-n, --navigate', 'Navigate to the saved URL after loading')
  .action(async (path: string, options) => {
    if (!existsSync(path)) {
      error(`File not found: ${path}`);
      return;
    }

    try {
      const stateJson = readFileSync(path, 'utf-8');
      const state = JSON.parse(stateJson);

      const result = await client.post('/api/state/load', {
        state,
        navigateToUrl: options.navigate,
      });

      if (result.success) {
        const data = result.data as {
          cookiesCount: number;
          localStorageCount: number;
          sessionStorageCount: number;
          url: string;
        };
        success(`State loaded from ${path}`);
        info(`  URL: ${data.url}`);
        info(`  Cookies: ${data.cookiesCount}`);
        info(`  localStorage: ${data.localStorageCount} items`);
        info(`  sessionStorage: ${data.sessionStorageCount} items`);
      } else {
        error('Failed to load state', result.error);
      }
    } catch (e) {
      error(`Failed to parse state file: ${(e as Error).message}`);
    }
  });

stateCmd
  .command('info')
  .description('Show current browser state info')
  .action(async () => {
    const result = await client.get('/api/state/info');
    if (result.success) {
      const data = result.data as {
        url: string;
        cookiesCount: number;
        localStorageCount: number;
        sessionStorageCount: number;
        timestamp: string;
      };
      info(`Current browser state:`);
      info(`  URL: ${data.url}`);
      info(`  Cookies: ${data.cookiesCount}`);
      info(`  localStorage: ${data.localStorageCount} items`);
      info(`  sessionStorage: ${data.sessionStorageCount} items`);
    } else {
      error('Failed to get state info', result.error);
    }
  });

// Parse and execute
// If no arguments provided, show brief help and exit successfully
if (process.argv.length <= 2) {
  showBriefHelp();
  process.exit(0);
}

program.parse();
