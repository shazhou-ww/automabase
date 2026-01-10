#!/usr/bin/env bun

/**
 * Local DynamoDB Setup Script
 *
 * This script ensures DynamoDB Local is running and all required tables are created.
 * Usage: bun scripts/setup-local-db.ts
 */

import { $ } from 'bun';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = (import.meta as { dir?: string }).dir || dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Configuration
const DYNAMODB_CONTAINER_NAME = 'dynamodb-local';
const DYNAMODB_IMAGE = 'amazon/dynamodb-local';
const DYNAMODB_PORT = 8000;
const DYNAMODB_ENDPOINT = `http://localhost:${DYNAMODB_PORT}`;

// Required tables
const REQUIRED_TABLES = [
  {
    name: 'automabase-dev',
    definitionFile: 'table-definition.json',
  },
  // Add more tables here if needed, e.g.:
  // {
  //   name: 'automabase-request-ids-dev',
  //   definitionFile: 'request-id-table-definition.json',
  // },
];

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step: string) {
  console.log(`\n${colors.cyan}▶ ${step}${colors.reset}`);
}

function logSuccess(message: string) {
  console.log(`  ${colors.green}✓${colors.reset} ${message}`);
}

function logWarning(message: string) {
  console.log(`  ${colors.yellow}⚠${colors.reset} ${message}`);
}

function logError(message: string) {
  console.log(`  ${colors.red}✗${colors.reset} ${message}`);
}

/**
 * Check if Docker is running
 */
async function isDockerRunning(): Promise<boolean> {
  try {
    await $`docker info`.quiet();
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if DynamoDB Local container exists and is running
 */
async function getContainerStatus(): Promise<'running' | 'stopped' | 'not-exists'> {
  try {
    const format = '{{.State.Running}}';
    const result = await $`docker inspect ${DYNAMODB_CONTAINER_NAME} --format ${format}`.quiet();
    const output = result.text().trim();
    return output === 'true' ? 'running' : 'stopped';
  } catch {
    return 'not-exists';
  }
}

/**
 * Check if container has correct configuration (-sharedDb)
 */
async function hasCorrectConfig(): Promise<boolean> {
  try {
    const format = '{{json .Config.Cmd}}';
    const result = await $`docker inspect ${DYNAMODB_CONTAINER_NAME} --format ${format}`.quiet();
    const cmd = result.text().trim();
    return cmd.includes('-sharedDb');
  } catch {
    return false;
  }
}

/**
 * Start DynamoDB Local container
 */
async function startContainer(): Promise<void> {
  const status = await getContainerStatus();

  if (status === 'running') {
    // Check if it has correct config
    if (await hasCorrectConfig()) {
      logSuccess(`DynamoDB Local is already running on port ${DYNAMODB_PORT}`);
      return;
    }
    // Wrong config, need to recreate
    logWarning('DynamoDB Local is running but missing -sharedDb, recreating...');
    await $`docker stop ${DYNAMODB_CONTAINER_NAME}`.quiet();
    await $`docker rm ${DYNAMODB_CONTAINER_NAME}`.quiet();
  } else if (status === 'stopped') {
    // Check config before starting
    if (await hasCorrectConfig()) {
      log('  Starting existing container...', 'dim');
      await $`docker start ${DYNAMODB_CONTAINER_NAME}`.quiet();
      logSuccess(`DynamoDB Local started on port ${DYNAMODB_PORT}`);
      return;
    }
    // Wrong config, need to recreate
    logWarning('Existing container missing -sharedDb, recreating...');
    await $`docker rm ${DYNAMODB_CONTAINER_NAME}`.quiet();
  }

  // Create new container
  log('  Creating new DynamoDB Local container...', 'dim');
  await $`docker run -d -p ${DYNAMODB_PORT}:8000 --name ${DYNAMODB_CONTAINER_NAME} ${DYNAMODB_IMAGE} -jar DynamoDBLocal.jar -sharedDb -inMemory`.quiet();
  logSuccess(`DynamoDB Local started on port ${DYNAMODB_PORT} with -sharedDb`);

  // Wait for container to be ready
  log('  Waiting for DynamoDB Local to be ready...', 'dim');
  await Bun.sleep(1000);
}

/**
 * Check if a table exists in DynamoDB Local
 */
async function tableExists(tableName: string): Promise<boolean> {
  try {
    await $`aws dynamodb describe-table --endpoint-url ${DYNAMODB_ENDPOINT} --table-name ${tableName}`.quiet();
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a table from definition file
 */
async function createTable(tableName: string, definitionFile: string): Promise<void> {
  const definitionPath = join(rootDir, definitionFile);

  if (!existsSync(definitionPath)) {
    logError(`Table definition file not found: ${definitionFile}`);
    return;
  }

  try {
    await $`aws dynamodb create-table --endpoint-url ${DYNAMODB_ENDPOINT} --cli-input-json file://${definitionPath}`.quiet();
    logSuccess(`Created table: ${tableName}`);
  } catch (error) {
    logError(`Failed to create table ${tableName}: ${error}`);
  }
}

/**
 * Ensure all required tables exist
 */
async function ensureTables(): Promise<void> {
  for (const table of REQUIRED_TABLES) {
    if (await tableExists(table.name)) {
      logSuccess(`Table exists: ${table.name}`);
    } else {
      log(`  Creating table: ${table.name}...`, 'dim');
      await createTable(table.name, table.definitionFile);
    }
  }
}

/**
 * List all tables (for verification)
 */
async function listTables(): Promise<string[]> {
  try {
    const result = await $`aws dynamodb list-tables --endpoint-url ${DYNAMODB_ENDPOINT} --output json`.quiet();
    const data = JSON.parse(result.text());
    return data.TableNames || [];
  } catch {
    return [];
  }
}

/**
 * Main function
 */
async function main() {
  console.log(`\n${colors.cyan}🗄️  Local DynamoDB Setup${colors.reset}\n`);

  // Step 1: Check Docker
  logStep('Checking Docker...');
  if (!(await isDockerRunning())) {
    logError('Docker is not running. Please start Docker Desktop first.');
    process.exit(1);
  }
  logSuccess('Docker is running');

  // Step 2: Start DynamoDB Local
  logStep('Starting DynamoDB Local...');
  await startContainer();

  // Step 3: Ensure tables exist
  logStep('Checking tables...');
  await ensureTables();

  // Step 4: Summary
  logStep('Summary');
  const tables = await listTables();
  console.log(`  ${colors.dim}Endpoint: ${DYNAMODB_ENDPOINT}${colors.reset}`);
  console.log(`  ${colors.dim}Tables: ${tables.join(', ') || '(none)'}${colors.reset}`);

  console.log(`\n${colors.green}✓ Local DynamoDB is ready!${colors.reset}\n`);
}

main().catch((error) => {
  logError(`Setup failed: ${error.message}`);
  process.exit(1);
});
