#!/usr/bin/env bun

/**
 * Test Tool - Run unit and E2E tests
 *
 * Usage:
 *   bun run test          # Run all tests (unit + e2e)
 *   bun run test unit     # Run unit tests only
 *   bun run test e2e      # Run E2E tests (against deployed env)
 *   bun run test e2e --local  # Run E2E tests against local dev environment
 */

import * as path from 'node:path';
import { spawn } from 'bun';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');

function parseArgs(argv: string[]): { command?: string; local?: boolean } {
  const result: { command?: string; local?: boolean } = {};

  for (const arg of argv) {
    if (!arg.startsWith('-')) {
      result.command = arg;
      break;
    }
  }

  result.local = argv.includes('--local');

  return result;
}

async function runCommand(
  cmd: string[],
  description: string,
  env?: Record<string, string>
): Promise<boolean> {
  console.log(`\n🧪 ${description}...`);

  const proc = spawn(cmd, {
    cwd: ROOT_DIR,
    stdout: 'inherit',
    stderr: 'inherit',
    env: { ...process.env, ...env },
  });

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    console.log(`❌ ${description} failed`);
    return false;
  }

  console.log(`✅ ${description} passed`);
  return true;
}

async function runUnitTests(): Promise<boolean> {
  return runCommand(['turbo', 'run', 'test'], 'Unit tests');
}

async function runE2ETests(local: boolean): Promise<boolean> {
  const env: Record<string, string> | undefined = local
    ? { API_BASE_URL: 'http://localhost:3000' }
    : undefined;
  const description = local ? 'E2E tests (local)' : 'E2E tests';

  return runCommand(['bun', 'run', '--cwd', 'e2e', 'test'], description, env);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  let success = true;

  switch (args.command) {
    case 'unit':
      success = await runUnitTests();
      break;

    case 'e2e':
      success = await runE2ETests(args.local ?? false);
      break;

    default: {
      // Run all tests
      console.log('🚀 Running all tests...');
      const unitResult = await runUnitTests();
      const e2eResult = await runE2ETests(args.local ?? false);
      success = unitResult && e2eResult;
    }
  }

  if (!success) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
