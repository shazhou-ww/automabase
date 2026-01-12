#!/usr/bin/env bun

/**
 * Deploy Tool - Build and deploy to AWS
 *
 * Usage:
 *   bun run deploy            # Build and deploy to AWS
 *   bun run deploy --guided   # Deploy with guided prompts
 *   bun run deploy build      # Build only (SAM build)
 *   bun run deploy validate   # Validate SAM template
 *   bun run deploy package    # Package for deployment
 */

import * as path from 'node:path';
import { spawn } from 'bun';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');

function parseArgs(argv: string[]): { command?: string; guided?: boolean } {
  const result: { command?: string; guided?: boolean } = {};

  for (const arg of argv) {
    if (!arg.startsWith('-')) {
      result.command = arg;
      break;
    }
  }

  result.guided = argv.includes('--guided');

  return result;
}

async function runCommand(cmd: string[], description: string): Promise<boolean> {
  console.log(`\n📦 ${description}...`);

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

  console.log(`✅ ${description} completed`);
  return true;
}

async function buildFunctions(): Promise<boolean> {
  console.log('\n🔨 Building Lambda functions...');

  // Build functions with turbo
  if (!(await runCommand(['turbo', 'run', 'build', '--filter=./functions/*'], 'Build functions'))) {
    return false;
  }

  // Copy manifests
  if (!(await runCommand(['bun', 'scripts/copy-function-manifests.ts'], 'Copy manifests'))) {
    return false;
  }

  return true;
}

async function mergeTemplates(): Promise<boolean> {
  return runCommand(['bun', 'scripts/merge-templates.ts'], 'Merge SAM templates');
}

async function samBuild(): Promise<boolean> {
  if (!(await buildFunctions())) return false;
  if (!(await mergeTemplates())) return false;
  return runCommand(['sam', 'build', '--template-file', 'merged-template.yaml'], 'SAM build');
}

async function samValidate(): Promise<boolean> {
  if (!(await mergeTemplates())) return false;
  return runCommand(['sam', 'validate', '--template-file', 'merged-template.yaml'], 'SAM validate');
}

async function samPackage(): Promise<boolean> {
  if (!(await samBuild())) return false;
  return runCommand(
    [
      'sam',
      'package',
      '--template-file',
      'merged-template.yaml',
      '--output-template-file',
      'packaged.yaml',
    ],
    'SAM package'
  );
}

async function samDeploy(guided: boolean): Promise<boolean> {
  if (!(await samBuild())) return false;

  const cmd = ['sam', 'deploy', '--template-file', 'merged-template.yaml'];
  if (guided) {
    cmd.push('--guided');
  }

  return runCommand(cmd, guided ? 'SAM deploy (guided)' : 'SAM deploy');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  let success = true;

  switch (args.command) {
    case 'build':
      success = await samBuild();
      break;

    case 'validate':
      success = await samValidate();
      break;

    case 'package':
      success = await samPackage();
      break;

    default:
      // Deploy
      success = await samDeploy(args.guided ?? false);
  }

  if (!success) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
