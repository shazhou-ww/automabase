#!/usr/bin/env bun

/**
 * Local Development Runner
 *
 * 一条命令启动完整本地开发环境：
 * 1. DynamoDB Local (Docker)
 * 2. SAM Lambda Service (Host)
 * 3. Dev Gateway (Host)
 *
 * Usage:
 *   bun run dev
 *   bun run dev --skip-build    跳过构建
 *   bun run dev --gateway-only  只启动 gateway（假设其他服务已运行）
 */

import * as path from 'node:path';
import { type Subprocess, spawn } from 'bun';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

// Service prefixes with colors
const prefixes = {
  dynamo: `${colors.cyan}[DynamoDB]${colors.reset}`,
  sam: `${colors.yellow}[SAM]${colors.reset}`,
  gateway: `${colors.green}[Gateway]${colors.reset}`,
  runner: `${colors.magenta}[Runner]${colors.reset}`,
};

// Parse arguments
const args = process.argv.slice(2);
const skipBuild = args.includes('--skip-build');
const gatewayOnly = args.includes('--gateway-only');

// Track running processes
const processes: Subprocess[] = [];

/**
 * Log with prefix
 */
function log(prefix: string, message: string) {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`${colors.gray}${timestamp}${colors.reset} ${prefix} ${message}`);
}

/**
 * Check if running on Windows
 */
const isWindows = process.platform === 'win32';

/**
 * Spawn a process with colored output
 */
function spawnService(
  _name: string,
  prefix: string,
  command: string[],
  options: { cwd?: string; env?: Record<string, string>; shell?: boolean } = {}
): Subprocess {
  log(prefix, `Starting: ${command.join(' ')}`);

  // On Windows, use shell for commands like 'sam' that are .cmd files
  const useShell = options.shell ?? isWindows;

  const proc = spawn({
    cmd: useShell
      ? [isWindows ? 'cmd' : 'sh', isWindows ? '/c' : '-c', command.join(' ')]
      : command,
    cwd: options.cwd || ROOT_DIR,
    env: { ...process.env, ...options.env, FORCE_COLOR: '1' },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  // Stream stdout with prefix
  (async () => {
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value).split('\n');
      for (const line of lines) {
        if (line.trim()) {
          console.log(`${prefix} ${line}`);
        }
      }
    }
  })();

  // Stream stderr with prefix (gray - many tools output normal logs to stderr)
  (async () => {
    const reader = proc.stderr.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value).split('\n');
      for (const line of lines) {
        if (line.trim()) {
          console.log(`${prefix} ${colors.gray}${line}${colors.reset}`);
        }
      }
    }
  })();

  processes.push(proc);
  return proc;
}

/**
 * Wait for a service to be ready
 */
async function waitForService(
  name: string,
  prefix: string,
  url: string,
  maxRetries = 30
): Promise<boolean> {
  log(prefix, `Waiting for ${name} at ${url}...`);

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) {
        log(prefix, `${name} is ready!`);
        return true;
      }
    } catch {
      // Not ready yet
    }
    await Bun.sleep(1000);
  }

  log(prefix, `${colors.red}${name} failed to start${colors.reset}`);
  return false;
}

/**
 * Check if Docker is running
 */
async function checkDocker(): Promise<boolean> {
  try {
    const proc = spawn({
      cmd: ['docker', 'info'],
      stdout: 'pipe',
      stderr: 'pipe',
    });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Check if DynamoDB is already running
 */
async function isDynamoRunning(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:8000');
    return response.status === 400; // DynamoDB returns 400 for root path
  } catch {
    return false;
  }
}

/**
 * Check if SAM Lambda is already running
 */
async function isSamRunning(): Promise<boolean> {
  try {
    await fetch('http://localhost:3001');
    return true; // Any response means it's running
  } catch {
    return false;
  }
}

/**
 * Cleanup on exit
 */
function cleanup() {
  log(prefixes.runner, 'Shutting down...');

  for (const proc of processes) {
    try {
      proc.kill();
    } catch {
      // Ignore
    }
  }

  // Stop Docker containers
  spawn({
    cmd: ['docker', 'compose', 'down'],
    cwd: ROOT_DIR,
    stdout: 'inherit',
    stderr: 'inherit',
  });
}

// Handle signals
process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

async function main() {
  console.log('\n');
  console.log('━'.repeat(60));
  console.log(`${colors.magenta}  🚀 Automabase Local Development Environment${colors.reset}`);
  console.log('━'.repeat(60));
  console.log('\n');

  // Gateway only mode
  if (gatewayOnly) {
    log(prefixes.runner, 'Gateway-only mode');
    spawnService('gateway', prefixes.gateway, [
      'bun',
      'run',
      'apps/dev-gateway/src/index.ts',
      '--mode',
      'remote',
    ]);
    return;
  }

  // Check Docker
  if (!(await checkDocker())) {
    log(
      prefixes.runner,
      `${colors.red}Docker is not running. Please start Docker first.${colors.reset}`
    );
    process.exit(1);
  }

  // Step 1: Start DynamoDB Local
  log(prefixes.runner, 'Step 1/4: Starting DynamoDB Local...');

  if (await isDynamoRunning()) {
    log(prefixes.dynamo, 'Already running on port 8000');
  } else {
    spawnService('dynamodb', prefixes.dynamo, ['docker', 'compose', 'up', 'dynamodb-local']);

    // Wait for DynamoDB
    const dynamoReady = await waitForService(
      'DynamoDB',
      prefixes.dynamo,
      'http://localhost:8000',
      30
    );
    if (!dynamoReady) {
      log(prefixes.runner, `${colors.red}Failed to start DynamoDB. Exiting.${colors.reset}`);
      cleanup();
      process.exit(1);
    }
  }

  // Step 2: Setup DynamoDB tables
  log(prefixes.runner, 'Step 2/4: Setting up DynamoDB tables...');
  const setupDb = spawn({
    cmd: ['bun', 'run', 'setup:db'],
    cwd: ROOT_DIR,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  await setupDb.exited;

  // Step 3: Build and start SAM
  log(prefixes.runner, 'Step 3/4: Starting SAM Lambda Service...');

  if (await isSamRunning()) {
    log(prefixes.sam, 'Already running on port 3002');
  } else {
    if (!skipBuild) {
      log(prefixes.sam, 'Building functions (this may take a moment)...');
      const build = spawn({
        cmd: ['bun', 'run', 'sam:build'],
        cwd: ROOT_DIR,
        stdout: 'inherit',
        stderr: 'inherit',
      });
      await build.exited;

      if (build.exitCode !== 0) {
        log(prefixes.runner, `${colors.red}Build failed. Exiting.${colors.reset}`);
        cleanup();
        process.exit(1);
      }
    }

    // Start SAM
    spawnService('sam', prefixes.sam, [
      'sam',
      'local',
      'start-lambda',
      '--template-file',
      'merged-template.yaml',
      '--env-vars',
      'env.json',
      '--skip-pull-image',
      '--docker-network',
      'host',
      '--warm-containers',
      'EAGER',
      '--port',
      '3001',
    ]);

    // Wait for SAM
    await Bun.sleep(3000); // SAM takes a moment to start
    const samReady = await waitForService('SAM Lambda', prefixes.sam, 'http://localhost:3001', 60);
    if (!samReady) {
      log(
        prefixes.runner,
        `${colors.yellow}SAM may still be starting. Continuing...${colors.reset}`
      );
    }
  }

  // Step 4: Start Dev Gateway
  log(prefixes.runner, 'Step 4/4: Starting Dev Gateway...');
  spawnService('gateway', prefixes.gateway, [
    'bun',
    'run',
    'apps/dev-gateway/src/index.ts',
    '--mode',
    'remote',
  ]);

  // Wait for Gateway
  await waitForService('Dev Gateway', prefixes.gateway, 'http://localhost:3000/health', 30);

  // Print summary
  console.log('\n');
  console.log('━'.repeat(60));
  console.log(`${colors.green}  ✅ Local Development Environment Ready${colors.reset}`);
  console.log('━'.repeat(60));
  console.log('\n');
  console.log(`  ${colors.cyan}DynamoDB Local${colors.reset}:    http://localhost:8000`);
  console.log(`  ${colors.yellow}SAM Lambda${colors.reset}:        http://localhost:3001`);
  console.log(`  ${colors.green}Dev Gateway${colors.reset}:       http://localhost:3000`);
  console.log(`  ${colors.green}WebSocket${colors.reset}:         ws://localhost:3000`);
  console.log('\n');
  console.log(`  ${colors.gray}Generate JWT:${colors.reset}       bun run jwt:local`);
  console.log(`  ${colors.gray}Run E2E tests:${colors.reset}      bun run test:e2e`);
  console.log('\n');
  console.log(`  ${colors.gray}Press Ctrl+C to stop all services${colors.reset}`);
  console.log('\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  cleanup();
  process.exit(1);
});
