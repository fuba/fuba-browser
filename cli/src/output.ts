import chalk from 'chalk';

export interface OutputOptions {
  json: boolean;
  debug: boolean;
}

let globalOptions: OutputOptions = {
  json: false,
  debug: false,
};

export function setOutputOptions(options: Partial<OutputOptions>): void {
  globalOptions = { ...globalOptions, ...options };
}

export function success(message: string, data?: unknown): void {
  if (globalOptions.json) {
    console.log(JSON.stringify({ success: true, message, data }, null, 2));
  } else {
    console.log(chalk.green('✓'), message);
    if (data && globalOptions.debug) {
      console.log(chalk.gray(JSON.stringify(data, null, 2)));
    }
  }
}

export function error(message: string, details?: string): void {
  if (globalOptions.json) {
    console.log(JSON.stringify({ success: false, error: message, details }, null, 2));
  } else {
    console.error(chalk.red('✗'), message);
    if (details) {
      console.error(chalk.gray(details));
    }
  }
  process.exit(1);
}

export function info(message: string): void {
  if (!globalOptions.json) {
    console.log(chalk.blue('ℹ'), message);
  }
}

export function debug(message: string, data?: unknown): void {
  if (globalOptions.debug && !globalOptions.json) {
    console.log(chalk.gray('[debug]'), message);
    if (data) {
      console.log(chalk.gray(JSON.stringify(data, null, 2)));
    }
  }
}

export function output(data: unknown): void {
  if (globalOptions.json) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    // Format snapshot tree in a readable way
    if (typeof data === 'object' && data !== null && 'tree' in data) {
      printSnapshot(data as SnapshotOutput);
    } else {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

interface SnapshotNode {
  ref: string;
  role: string;
  name: string;
  tag: string;
  visible: boolean;
  focusable: boolean;
  children?: SnapshotNode[];
}

interface SnapshotOutput {
  url: string;
  title: string;
  viewport: { width: number; height: number };
  tree: SnapshotNode[];
}

function printSnapshot(snapshot: SnapshotOutput): void {
  console.log(chalk.bold('Page:'), snapshot.title);
  console.log(chalk.bold('URL:'), snapshot.url);
  console.log(chalk.bold('Viewport:'), `${snapshot.viewport.width}x${snapshot.viewport.height}`);
  console.log();

  printTree(snapshot.tree, 0);
}

function printTree(nodes: SnapshotNode[], depth: number): void {
  const indent = '  '.repeat(depth);

  for (const node of nodes) {
    const ref = chalk.cyan(`@${node.ref}`);
    const role = chalk.yellow(node.role);
    const name = node.name ? chalk.white(` "${truncate(node.name, 50)}"`) : '';
    const visibility = node.visible ? '' : chalk.gray(' [hidden]');
    const focusable = node.focusable ? chalk.green(' [focusable]') : '';

    console.log(`${indent}${ref} ${role}${name}${visibility}${focusable}`);

    if (node.children) {
      printTree(node.children, depth + 1);
    }
  }
}

function truncate(str: string, maxLen: number): string {
  // Remove newlines and excess whitespace
  const cleaned = str.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.substring(0, maxLen - 3) + '...';
}

export function raw(data: string | Buffer): void {
  process.stdout.write(data);
}
