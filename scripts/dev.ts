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
import { setupDynamoDB } from './setup-db';

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
    const response = await fetch('http://localhost:3200');
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
    await fetch('http://localhost:3202');
    return true; // Any response means it's running
  } catch {
    return false;
  }
}

/**
 * Cleanup on exit
 */
async function cleanup() {
  log(prefixes.runner, 'Shutting down...');

  // Kill all spawned processes
  for (const proc of processes) {
    try {
      proc.kill();
    } catch {
      // Ignore
    }
  }

  // Wait a moment for processes to terminate
  await Bun.sleep(500);

  // Stop SAM Lambda containers (they have names starting with "sam-")
  log(prefixes.runner, 'Stopping SAM Lambda containers...');
  const samContainers = spawn({
    cmd: ['docker', 'ps', '-q', '--filter', 'name=sam-'],
    cwd: ROOT_DIR,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const containerIds = await new Response(samContainers.stdout).text();
  if (containerIds.trim()) {
    const stopSam = spawn({
      cmd: ['docker', 'stop', ...containerIds.trim().split('\n')],
      cwd: ROOT_DIR,
      stdout: 'inherit',
      stderr: 'inherit',
    });
    await stopSam.exited;
  }

  // Stop Docker Compose containers and wait for completion
  log(prefixes.runner, 'Stopping Docker Compose containers...');
  const dockerDown = spawn({
    cmd: ['docker', 'compose', 'down'],
    cwd: ROOT_DIR,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  await dockerDown.exited;
  log(prefixes.runner, 'All containers stopped.');
}

// Track if cleanup is in progress to prevent multiple cleanups
let isCleaningUp = false;

// Handle signals
process.on('SIGINT', async () => {
  if (isCleaningUp) return;
  isCleaningUp = true;
  await cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  if (isCleaningUp) return;
  isCleaningUp = true;
  await cleanup();
  process.exit(0);
});

// Handle Windows-specific close events
if (process.platform === 'win32') {
  process.on('SIGHUP', async () => {
    if (isCleaningUp) return;
    isCleaningUp = true;
    await cleanup();
    process.exit(0);
  });
}

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
    log(prefixes.dynamo, 'Already running on port 3200');
  } else {
    spawnService('dynamodb', prefixes.dynamo, ['docker', 'compose', 'up', 'dynamodb-local']);

    // Wait for DynamoDB
    const dynamoReady = await waitForService(
      'DynamoDB',
      prefixes.dynamo,
      'http://localhost:3200',
      30
    );
    if (!dynamoReady) {
      log(prefixes.runner, `${colors.red}Failed to start DynamoDB. Exiting.${colors.reset}`);
      await cleanup();
      process.exit(1);
    }
  }

  // Step 2: Setup DynamoDB tables
  log(prefixes.runner, 'Step 2/4: Setting up DynamoDB tables...');
  try {
    await setupDynamoDB({ silent: true });
    log(prefixes.runner, 'DynamoDB tables ready');
  } catch (error) {
    log(
      prefixes.runner,
      `${colors.red}Failed to setup DynamoDB tables: ${(error as Error).message}${colors.reset}`
    );
    await cleanup();
    process.exit(1);
  }

  // Step 3: Build and start SAM
  log(prefixes.runner, 'Step 3/4: Starting SAM Lambda Service...');

  if (await isSamRunning()) {
    log(prefixes.sam, 'Already running on port 3202');
  } else {
    if (!skipBuild) {
      // First, build Lambda stacks
      log(prefixes.sam, 'Building Lambda stacks...');
      const stacksBuild = spawn({
        cmd: ['turbo', 'run', 'build', '--filter=./stacks/*'],
        cwd: ROOT_DIR,
        stdout: 'inherit',
        stderr: 'inherit',
      });
      await stacksBuild.exited;

      if (stacksBuild.exitCode !== 0) {
        log(prefixes.runner, `${colors.red}Stacks build failed. Exiting.${colors.reset}`);
        await cleanup();
        process.exit(1);
      }

      // Then, build SAM template
      log(prefixes.sam, 'Building SAM template (this may take a moment)...');
      const build = spawn({
        cmd: ['sam', 'build', '--use-container', '--cached'],
        cwd: ROOT_DIR,
        stdout: 'inherit',
        stderr: 'inherit',
      });
      await build.exited;

      if (build.exitCode !== 0) {
        log(prefixes.runner, `${colors.red}SAM build failed. Exiting.${colors.reset}`);
        await cleanup();
        process.exit(1);
      }
    }

    // Start SAM
    spawnService('sam', prefixes.sam, [
      'sam',
      'local',
      'start-lambda',
      '--template-file',
      'template.yaml',
      '--env-vars',
      'env.json',
      '--skip-pull-image',
      '--docker-network',
      'host',
      '--warm-containers',
      'EAGER',
      '--port',
      '3202',
    ]);

    // Wait for SAM
    await Bun.sleep(3000); // SAM takes a moment to start
    const samReady = await waitForService('SAM Lambda', prefixes.sam, 'http://localhost:3202', 60);
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
  await waitForService('Dev Gateway', prefixes.gateway, 'http://localhost:3201/health', 30);

  // Print summary
  console.log('\n');
  console.log('━'.repeat(60));
  console.log(`${colors.green}  ✅ Local Development Environment Ready${colors.reset}`);
  console.log('━'.repeat(60));
  console.log('\n');
  console.log(`  ${colors.cyan}DynamoDB Local${colors.reset}:    http://localhost:3200`);
  console.log(`  ${colors.yellow}SAM Lambda${colors.reset}:        http://localhost:3202`);
  console.log(`  ${colors.green}Dev Gateway${colors.reset}:       http://localhost:3201`);
  console.log(`  ${colors.green}WebSocket${colors.reset}:         ws://localhost:3201`);
  console.log('\n');
  console.log(`  ${colors.gray}Generate JWT:${colors.reset}       bun run jwt:local`);
  console.log(`  ${colors.gray}Run E2E tests:${colors.reset}      bun run test:e2e`);
  console.log('\n');
  console.log(`  ${colors.gray}Press Ctrl+C to stop all services${colors.reset}`);
  console.log('\n');
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await cleanup();
  process.exit(1);
});
