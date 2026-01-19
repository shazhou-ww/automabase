#!/usr/bin/env bun

/**
 * Build all Lambda functions in this stack
 * Each function is built as a separate entry point to dist/<function-name>/index.js
 */

import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const __dirname =
  (import.meta as { dir?: string }).dir || fileURLToPath(new URL('.', import.meta.url));
const stackDir = join(__dirname, '..');
const rootDir = join(stackDir, '../..');
const functionsDir = join(stackDir, 'src', 'functions');
const distDir = join(stackDir, 'dist');

// Find all function directories
const functions = readdirSync(functionsDir, { withFileTypes: true })
  .filter((dirent) => dirent.isDirectory())
  .map((dirent) => dirent.name);

if (functions.length === 0) {
  console.error('No functions found in src/functions/');
  process.exit(1);
}

console.log(`Building ${functions.length} function(s): ${functions.join(', ')}`);

// Build each function
for (const functionName of functions) {
  const functionSrcDir = join(functionsDir, functionName);
  const entryPoint = join(functionSrcDir, 'index.ts');
  const outputDir = join(distDir, functionName);
  const outputFile = join(outputDir, 'index.js');

  // Check if entry point exists
  try {
    if (!statSync(entryPoint).isFile()) {
      console.warn(`Warning: ${entryPoint} not found, skipping ${functionName}`);
      continue;
    }
  } catch {
    console.warn(`Warning: ${entryPoint} not found, skipping ${functionName}`);
    continue;
  }

  console.log(`\nBuilding ${functionName}...`);

  try {
    await build({
      entryPoints: [resolve(rootDir, entryPoint)],
      bundle: true,
      platform: 'node',
      target: 'node24',
      format: 'cjs',
      outfile: resolve(rootDir, outputFile),
      external: ['@aws-sdk/*'],
      minify: true,
      sourcemap: true,
      // Use root directory as working directory to resolve workspace dependencies
      absWorkingDir: rootDir,
    });

    console.log(`✓ Built ${functionName} -> ${outputFile}`);
  } catch (error) {
    console.error(`✗ Failed to build ${functionName}:`, error);
    process.exit(1);
  }
}

console.log(`\n✓ All functions built successfully!`);
