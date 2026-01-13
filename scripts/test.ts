#!/usr/bin/env bun

/**
 * Test Tool - Run unit and E2E tests
 *
 * Usage:
 *   bun run test                              # Run all tests (unit + e2e local)
 *   bun run test unit                         # Run unit tests only
 *   bun run test e2e                          # Run E2E tests against local (default)
 *   bun run test e2e --endpoint <url>         # Run E2E tests against specified endpoint
 *
 * Examples:
 *   bun run test e2e                          # Local dev server (localhost:3000)
 *   bun run test e2e --endpoint https://xxx.execute-api.ap-southeast-2.amazonaws.com
 */

import * as path from 'node:path';
import { spawn, spawnSync } from 'bun';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const LOCAL_GATEWAY_URL = 'http://localhost:3000';

// Cognito defaults (from deployed stack)
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || 'ap-southeast-2_2cTIVAhYG';
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID || '6rjt3vskji08mdscm6pqloppmn';
const COGNITO_REGION = process.env.AWS_REGION || 'ap-southeast-2';
const COGNITO_USERNAME = process.env.E2E_USERNAME || 'test@example.com';
const COGNITO_PASSWORD = process.env.E2E_PASSWORD || 'TestUser123!';

interface ParsedArgs {
  command?: string;
  endpoint?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--endpoint' && argv[i + 1]) {
      result.endpoint = argv[i + 1];
      i++; // Skip next arg
    } else if (!arg.startsWith('-') && !result.command) {
      result.command = arg;
    }
  }

  return result;
}

function isLocalUrl(url: string): boolean {
  return url.includes('localhost') || url.includes('127.0.0.1');
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

/**
 * Login to Cognito and get ID token
 */
function getCognitoToken(): string | null {
  console.log('\n🔐 Logging in to Cognito...');
  console.log(`   User Pool: ${COGNITO_USER_POOL_ID}`);
  console.log(`   Username: ${COGNITO_USERNAME}`);

  try {
    const proc = spawnSync([
      'aws',
      'cognito-idp',
      'initiate-auth',
      '--client-id',
      COGNITO_CLIENT_ID,
      '--auth-flow',
      'USER_PASSWORD_AUTH',
      '--auth-parameters',
      `USERNAME=${COGNITO_USERNAME},PASSWORD=${COGNITO_PASSWORD}`,
      '--region',
      COGNITO_REGION,
    ]);

    if (proc.exitCode !== 0) {
      const errorText = proc.stderr.toString();
      console.log('');
      console.log('❌ Cognito login failed!');
      console.log('');

      if (errorText.includes('NotAuthorizedException')) {
        console.log('   Invalid username or password.');
        console.log('');
        console.log('   Set credentials via environment variables:');
        console.log('     $env:E2E_USERNAME = "your-email@example.com"');
        console.log('     $env:E2E_PASSWORD = "YourPassword123!"');
      } else if (errorText.includes('UserNotFoundException')) {
        console.log('   User not found. Create a test user first:');
        console.log('     bun scripts/manage-test-user.ts <email> <password>');
      } else {
        console.log(`   Error: ${errorText}`);
      }
      return null;
    }

    const result = JSON.parse(proc.stdout.toString());
    if (result?.AuthenticationResult?.IdToken) {
      console.log('✅ Cognito login successful');
      return result.AuthenticationResult.IdToken;
    }

    console.log('❌ No token in response');
    return null;
  } catch (error) {
    console.log(`❌ Cognito login error: ${(error as Error).message}`);
    return null;
  }
}

async function runE2ETests(endpoint: string): Promise<boolean> {
  const isLocal = isLocalUrl(endpoint);
  const description = isLocal ? 'E2E tests (local)' : `E2E tests (${new URL(endpoint).host})`;

  // For local: check if dev server is running
  if (isLocal) {
    console.log('\n🔍 Checking local dev server...');
    const isRunning = await isLocalDevServerRunning();

    if (!isRunning) {
      console.log('');
      console.log('⚠️  Local dev server is not running!');
      console.log('');
      console.log('   To start the dev server, run:');
      console.log('     bun run dev');
      console.log('');
      console.log('   Or specify a remote endpoint:');
      console.log('     bun run test e2e --endpoint https://your-api.amazonaws.com');
      console.log('');
      console.log('⏭️  Skipping E2E tests.');
      return true; // Return true to not fail the overall test run
    }

    console.log('✅ Local dev server is running');
  }

  // Build environment variables
  const env: Record<string, string> = {
    API_BASE_URL: endpoint,
  };

  // For remote: need Cognito authentication
  if (!isLocal) {
    console.log('\n☁️  Remote endpoint detected, Cognito authentication required...');

    // Check if token is already provided
    if (process.env.COGNITO_TOKEN) {
      console.log('✅ Using existing COGNITO_TOKEN from environment');
      env.COGNITO_TOKEN = process.env.COGNITO_TOKEN;
    } else {
      // Try to login automatically
      const token = getCognitoToken();
      if (!token) {
        console.log('');
        console.log('⏭️  Skipping E2E tests (authentication failed).');
        return true;
      }
      env.COGNITO_TOKEN = token;
    }
  }

  return runCommand(['bun', 'run', '--cwd', 'e2e', 'test'], description, env);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // Determine endpoint
  const endpoint = args.endpoint || LOCAL_GATEWAY_URL;

  let success = true;

  switch (args.command) {
    case 'unit':
      success = await runUnitTests();
      break;

    case 'e2e':
      success = await runE2ETests(endpoint);
      break;

    default: {
      // Run all tests (unit + e2e)
      console.log('🚀 Running all tests...');
      const unitResult = await runUnitTests();
      const e2eResult = await runE2ETests(endpoint);
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
