#!/usr/bin/env bun

/**
 * Local DynamoDB Setup Script
 *
 * This script ensures DynamoDB Local is running and all required tables are created.
 * Usage: bun scripts/setup-db.ts
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { $ } from 'bun';

const __dirname = (import.meta as { dir?: string }).dir || dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Configuration
const DYNAMODB_CONTAINER_NAME = 'automabase-dynamodb';
const DYNAMODB_PORT = 3200;
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
 * Start DynamoDB Local container using docker compose
 */
async function startDynamoDBContainer(options: { silent?: boolean } = {}): Promise<void> {
  const rootDir = join(__dirname, '..');
  try {
    if (!options.silent) {
      log('Starting DynamoDB Local container...', 'dim');
    }
    await $`docker compose up -d dynamodb-local`.cwd(rootDir).quiet();
    if (!options.silent) {
      logSuccess('DynamoDB Local container started');
    }

    // Wait for container to be ready
    if (!options.silent) {
      log('Waiting for DynamoDB Local to be ready...', 'dim');
    }
    let retries = 30;
    while (retries > 0) {
      const status = await getContainerStatus();
      if (status === 'running') {
        // Also check if the service is responding
        try {
          const response = await fetch(`http://localhost:${DYNAMODB_PORT}`);
          // DynamoDB returns 400 for root path, which means it's ready
          if (response.status === 400 || response.ok) {
            break;
          }
        } catch {
          // Not ready yet
        }
      }
      await Bun.sleep(1000);
      retries--;
    }

    if (retries === 0) {
      throw new Error('DynamoDB Local container failed to start');
    }
  } catch (error) {
    logError(`Failed to start DynamoDB Local container: ${error}`);
    throw error;
  }
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
    const result =
      await $`aws dynamodb list-tables --endpoint-url ${DYNAMODB_ENDPOINT} --output json`.quiet();
    const data = JSON.parse(result.text());
    return data.TableNames || [];
  } catch {
    return [];
  }
}

/**
 * Setup DynamoDB Local tables
 * Can be called from other scripts or run standalone
 */
export async function setupDynamoDB(options: { silent?: boolean } = {}): Promise<void> {
  if (!options.silent) {
    console.log(`\n${colors.cyan}🗄️  Local DynamoDB Setup${colors.reset}\n`);
  }

  // Step 1: Check Docker
  if (!options.silent) {
    logStep('Checking Docker...');
  }
  if (!(await isDockerRunning())) {
    logError('Docker is not running. Please start Docker Desktop first.');
    throw new Error('Docker is not running');
  }
  if (!options.silent) {
    logSuccess('Docker is running');
  }

  // Step 2: Check if DynamoDB Local is running, start if needed
  if (!options.silent) {
    logStep('Checking DynamoDB Local...');
  }
  let status = await getContainerStatus();

  if (status === 'not-exists') {
    if (!options.silent) {
      logWarning('DynamoDB Local container not found. Creating it...');
    }
    await startDynamoDBContainer(options);
    status = await getContainerStatus();
  } else if (status === 'stopped') {
    if (!options.silent) {
      logWarning('DynamoDB Local container is stopped. Starting it...');
    }
    await startDynamoDBContainer(options);
    status = await getContainerStatus();
  }

  if (status !== 'running') {
    throw new Error('DynamoDB Local container failed to start');
  }

  if (!options.silent) {
    logSuccess(`DynamoDB Local is running on port ${DYNAMODB_PORT}`);
  }

  // Step 3: Ensure tables exist
  if (!options.silent) {
    logStep('Checking tables...');
  }
  await ensureTables();

  // Step 4: Summary
  if (!options.silent) {
    logStep('Summary');
    const tables = await listTables();
    console.log(`  ${colors.dim}Endpoint: ${DYNAMODB_ENDPOINT}${colors.reset}`);
    console.log(`  ${colors.dim}Tables: ${tables.join(', ') || '(none)'}${colors.reset}`);
    console.log(`\n${colors.green}✓ Local DynamoDB is ready!${colors.reset}\n`);
  }
}

/**
 * Main function (for standalone execution)
 */
async function main() {
  await setupDynamoDB();
}

// Only run main if this script is executed directly
if (import.meta.main) {
  main().catch((error) => {
    logError(`Setup failed: ${error.message}`);
    process.exit(1);
  });
}
