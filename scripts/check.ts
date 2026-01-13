#!/usr/bin/env bun

/**
 * Check Tool - Run linting and type checking
 *
 * Usage:
 *   bun run check         # Run all checks (lint + typecheck)
 *   bun run check --fix   # Run all checks and auto-fix issues
 */

import * as path from 'node:path';
import { spawn } from 'bun';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');

const args = process.argv.slice(2);
const shouldFix = args.includes('--fix');

async function runCommand(cmd: string[], description: string): Promise<boolean> {
  console.log(`\n📋 ${description}...`);

  const proc = spawn(cmd, {
    cwd: ROOT_DIR,
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    console.log(`❌ ${description} failed`);
    return false;
  }

  console.log(`✅ ${description} passed`);
  return true;
}

async function main(): Promise<void> {
  console.log(`🔍 Running checks${shouldFix ? ' with auto-fix' : ''}...`);

  const results: boolean[] = [];

  // Biome (TS/JS linting and formatting)
  if (shouldFix) {
    results.push(await runCommand(['biome', 'check', '--write', '.'], 'Biome check'));
    results.push(await runCommand(['biome', 'format', '--write', '.'], 'Biome format'));
  } else {
    results.push(await runCommand(['biome', 'check', '.'], 'Biome check'));
    results.push(await runCommand(['biome', 'format', '.'], 'Biome format'));
  }

  // Markdownlint
  const mdIgnores = [
    '--ignore',
    '**/node_modules/**',
    '--ignore',
    '**/dist/**',
    '--ignore',
    '**/build/**',
    '--ignore',
    '**/.aws-sam/**',
    '--ignore',
    '**/.turbo/**',
    '--ignore',
    '**/templates/**',
  ];

  if (shouldFix) {
    results.push(
      await runCommand(['markdownlint', '**/*.md', '--fix', ...mdIgnores], 'Markdown lint')
    );
  } else {
    results.push(await runCommand(['markdownlint', '**/*.md', ...mdIgnores], 'Markdown lint'));
  }

  // TypeScript type checking (packages via turbo)
  results.push(await runCommand(['turbo', 'run', 'typecheck'], 'TypeScript check'));

  // TypeScript type checking for root-level scripts (not managed by turbo)
  results.push(
    await runCommand(['tsc', '--project', 'tsconfig.json', '--noEmit'], 'Scripts TypeScript check')
  );

  // Summary
  const passed = results.filter((r) => r).length;
  const total = results.length;

  console.log(`\n${'='.repeat(50)}`);
  if (passed === total) {
    console.log(`✅ All ${total} checks passed!`);
  } else {
    console.log(`❌ ${total - passed}/${total} checks failed`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
