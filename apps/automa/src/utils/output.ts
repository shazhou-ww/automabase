/**
 * Output formatting utilities
 */

import chalk from 'chalk';

export type OutputFormat = 'json' | 'table';

let outputFormat: OutputFormat = 'json';
let quietMode = false;
let verboseMode = false;

export function setOutputFormat(format: OutputFormat): void {
  outputFormat = format;
}

export function getOutputFormat(): OutputFormat {
  return outputFormat;
}

export function setQuietMode(quiet: boolean): void {
  quietMode = quiet;
}

export function setVerboseMode(verbose: boolean): void {
  verboseMode = verbose;
}

export function isQuiet(): boolean {
  return quietMode;
}

export function isVerbose(): boolean {
  return verboseMode;
}

/**
 * Print JSON output
 */
export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Simple table implementation (avoids cli-table3 Bun compatibility issues)
 */
export function printTable(
  headers: string[],
  rows: string[][],
  _options?: { compact?: boolean }
): void {
  // Calculate column widths
  const columnWidths: number[] = headers.map((h) => stripAnsi(h).length);

  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      const len = stripAnsi(row[i] || '').length;
      if (len > (columnWidths[i] || 0)) {
        columnWidths[i] = len;
      }
    }
  }

  // Print header
  const headerLine = headers.map((h, i) => chalk.bold(padRight(h, columnWidths[i]))).join('  ');
  console.log(headerLine);
  console.log(columnWidths.map((w) => '-'.repeat(w)).join('  '));

  // Print rows
  for (const row of rows) {
    const line = row.map((cell, i) => padRight(cell || '', columnWidths[i])).join('  ');
    console.log(line);
  }
}

/**
 * Strip ANSI escape codes for width calculation
 */
function stripAnsi(str: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes use control characters
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * Pad string to the right
 */
function padRight(str: string, width: number): string {
  const visibleLength = stripAnsi(str).length;
  const padding = Math.max(0, width - visibleLength);
  return str + ' '.repeat(padding);
}

/**
 * Print data in current format
 */
export function printData(
  data: unknown,
  tableConfig?: {
    headers: string[];
    getRow: (item: unknown) => string[];
  }
): void {
  if (outputFormat === 'json' || !tableConfig) {
    printJson(data);
    return;
  }

  // Table format
  const items = Array.isArray(data) ? data : [data];
  const rows = items.map(tableConfig.getRow);
  printTable(tableConfig.headers, rows);
}

/**
 * Print success message
 */
export function success(message: string): void {
  if (!quietMode) {
    console.log(chalk.green('✓'), message);
  }
}

/**
 * Print error message
 */
export function error(message: string): void {
  console.error(chalk.red('✗'), message);
}

/**
 * Print warning message
 */
export function warn(message: string): void {
  if (!quietMode) {
    console.warn(chalk.yellow('⚠'), message);
  }
}

/**
 * Print info message
 */
export function info(message: string): void {
  if (!quietMode) {
    console.log(chalk.blue('ℹ'), message);
  }
}

/**
 * Print verbose message (only if verbose mode)
 */
export function verbose(message: string): void {
  if (verboseMode) {
    console.log(chalk.gray('▸'), chalk.gray(message));
  }
}
