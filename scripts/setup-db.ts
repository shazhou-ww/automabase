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

  // Step 2: Check if DynamoDB Local is running
  logStep('Checking DynamoDB Local...');
  const status = await getContainerStatus();
  if (status === 'not-exists') {
    logWarning('DynamoDB Local container not found. Please run "docker compose up -d dynamodb-local" first.');
    process.exit(1);
  } else if (status === 'stopped') {
    logWarning('DynamoDB Local container is stopped. Please run "docker compose up -d dynamodb-local" first.');
    process.exit(1);
  }
  logSuccess(`DynamoDB Local is running on port ${DYNAMODB_PORT}`);

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
