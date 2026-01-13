#!/usr/bin/env bun

/**
 * Test Tool - Run unit and E2E tests
 *
 * Usage:
 *   bun run test              # Run all tests (unit + e2e local)
 *   bun run test unit         # Run unit tests only
 *   bun run test e2e          # Run E2E tests against local dev environment (default)
 *   bun run test e2e --remote # Run E2E tests against deployed environment
 */

import * as path from 'node:path';
import { spawn } from 'bun';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const LOCAL_GATEWAY_URL = 'http://localhost:3000';

function parseArgs(argv: string[]): { command?: string; remote?: boolean } {
  const result: { command?: string; remote?: boolean } = {};

  for (const arg of argv) {
    if (!arg.startsWith('-')) {
      result.command = arg;
      break;
    }
  }

  result.remote = argv.includes('--remote');

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

/**
 * Check if local dev server is running
 */
async function isLocalDevServerRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${LOCAL_GATEWAY_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function runE2ETests(local: boolean): Promise<boolean> {
  // Check if local dev server is running when running local tests
  if (local) {
    console.log('\n🔍 Checking local dev server...');
    const isRunning = await isLocalDevServerRunning();

    if (!isRunning) {
      console.log('');
      console.log('⚠️  Local dev server is not running!');
      console.log('');
      console.log('   To start the dev server, run:');
      console.log('     bun run dev');
      console.log('');
      console.log('   Or run E2E tests against remote:');
      console.log('     bun run test e2e --remote');
      console.log('');
      console.log('⏭️  Skipping E2E tests.');
      return true; // Return true to not fail the overall test run
    }

    console.log('✅ Local dev server is running');
  }

  const env: Record<string, string> | undefined = local
    ? { API_BASE_URL: LOCAL_GATEWAY_URL }
    : undefined;
  const description = local ? 'E2E tests (local)' : 'E2E tests (remote)';

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
      // Default to local, use --remote for deployed environment
      success = await runE2ETests(!args.remote);
      break;

    default: {
      // Run all tests (unit + e2e local)
      console.log('🚀 Running all tests...');
      const unitResult = await runUnitTests();
      const e2eResult = await runE2ETests(!args.remote);
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
