/**
 * Output formatting utilities
 */

import chalk from 'chalk';
import Table from 'cli-table3';

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
 * Print table output
 */
export function printTable(
  headers: string[],
  rows: string[][],
  options?: { compact?: boolean }
): void {
  const table = new Table({
    head: headers.map((h) => chalk.bold(h)),
    style: {
      head: [],
      border: [],
    },
    ...(options?.compact ? { chars: { mid: '', 'mid-mid': '', middle: ' ' } } : {}),
  });

  for (const row of rows) {
    table.push(row);
  }

  console.log(table.toString());
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
