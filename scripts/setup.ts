#!/usr/bin/env bun
/**
 * Setup Tool - Initialize development environment
 *
 * Usage:
 *   bun run setup         # Full environment setup (install deps, generate keys, etc.)
 *   bun run setup jwt     # Generate a new JWT token for API testing
 */

import * as crypto from 'node:crypto';
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ENV_JSON_PATH = resolve(import.meta.dirname, '..', 'env.json');
const ENV_JSON_EXAMPLE_PATH = resolve(import.meta.dirname, '..', 'env.json.example');

// ============================================================================
// Utility functions
// ============================================================================

function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function signEd25519Jwt(
  payload: Record<string, unknown>,
  options: { privateKeyPem: string; issuer: string; expiresIn?: number }
) {
  const header = { alg: 'EdDSA', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);

  const claims = {
    ...payload,
    iss: options.issuer,
    iat: now,
    exp: now + (options.expiresIn || 3600),
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(claims));
  const message = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto.sign(null, Buffer.from(message), {
    key: options.privateKeyPem,
    format: 'pem',
  });

  return `${message}.${base64url(signature)}`;
}

function loadKeysFromEnvJson(): { privateKey?: string; issuer?: string } {
  if (!existsSync(ENV_JSON_PATH)) return {};

  const raw = readFileSync(ENV_JSON_PATH, 'utf-8');
  const parsed = JSON.parse(raw) as Record<string, any>;
  const e2e = parsed.E2ETests as Record<string, any> | undefined;

  return {
    privateKey: e2e?.LOCAL_JWT_PRIVATE_KEY,
    issuer: e2e?.LOCAL_JWT_ISSUER,
  };
}

// ============================================================================
// Commands
// ============================================================================

/**
 * Full environment setup
 */
async function setupEnvironment(): Promise<void> {
  console.log('🚀 Setting up development environment...\n');

  // Step 1: Check if env.json exists, create if not
  let envConfig: Record<string, unknown>;

  if (existsSync(ENV_JSON_PATH)) {
    console.log('✅ env.json exists');
    const content = readFileSync(ENV_JSON_PATH, 'utf-8');
    envConfig = JSON.parse(content);
  } else if (existsSync(ENV_JSON_EXAMPLE_PATH)) {
    console.log('📄 Creating env.json from env.json.example...');
    const content = readFileSync(ENV_JSON_EXAMPLE_PATH, 'utf-8');
    envConfig = JSON.parse(content);
    writeFileSync(ENV_JSON_PATH, content);
    console.log('✅ env.json created');
  } else {
    console.error('❌ Neither env.json nor env.json.example found');
    process.exit(1);
  }

  // Step 2: Check if JWT keys exist, generate if not
  const e2eConfig = envConfig.E2ETests as Record<string, unknown> | undefined;
  if (!e2eConfig?.LOCAL_JWT_PRIVATE_KEY) {
    console.log('\n🔐 Generating JWT keys...');
    await generateKeys();
  } else {
    console.log('✅ JWT keys already configured');
  }

  console.log('\n✅ Setup complete!');
  console.log('\nNext steps:');
  console.log('  1. Start development: bun run dev');
  console.log('  2. Run tests: bun run test');
}

/**
 * Generate Ed25519 key pair and save to env.json
 */
async function generateKeys(): Promise<void> {
  let envConfig: Record<string, unknown>;

  if (existsSync(ENV_JSON_PATH)) {
    const content = readFileSync(ENV_JSON_PATH, 'utf-8');
    envConfig = JSON.parse(content);
  } else if (existsSync(ENV_JSON_EXAMPLE_PATH)) {
    console.log('📄 Creating env.json from env.json.example...');
    const content = readFileSync(ENV_JSON_EXAMPLE_PATH, 'utf-8');
    envConfig = JSON.parse(content);
  } else {
    console.error('❌ Neither env.json nor env.json.example found');
    process.exit(1);
  }

  // Generate Ed25519 key pair
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  // Update function configs with public key (for SAM Local)
  const functionsToUpdate = ['AutomataApiFunction', 'AutomataWsFunction'];

  for (const funcName of functionsToUpdate) {
    let funcConfig = envConfig[funcName] as Record<string, unknown> | undefined;
    if (!funcConfig) {
      funcConfig = {};
      envConfig[funcName] = funcConfig;
    }
    funcConfig.LOCAL_JWT_PUBLIC_KEY = publicKey;
    funcConfig.LOCAL_JWT_ISSUER = 'local-dev';
  }

  // Store private key in E2ETests section
  let e2eConfig = envConfig.E2ETests as Record<string, unknown> | undefined;
  if (!e2eConfig) {
    e2eConfig = {};
    envConfig.E2ETests = e2eConfig;
  }
  e2eConfig.LOCAL_JWT_PRIVATE_KEY = privateKey;
  e2eConfig.LOCAL_JWT_PUBLIC_KEY = publicKey;
  e2eConfig.LOCAL_JWT_ISSUER = 'local-dev';

  // Write back to env.json
  writeFileSync(ENV_JSON_PATH, `${JSON.stringify(envConfig, null, 2)}\n`);

  console.log('✅ JWT keys generated and saved to env.json');
}

/**
 * Generate a new JWT token
 */
function generateJwt(accountId?: string): void {
  const fromEnvJson = loadKeysFromEnvJson();

  const privateKeyPem = process.env.LOCAL_JWT_PRIVATE_KEY || fromEnvJson.privateKey;
  const issuer = process.env.LOCAL_JWT_ISSUER || fromEnvJson.issuer || 'local-dev';

  if (!privateKeyPem) {
    console.error('❌ Missing JWT keys.\n\n' + 'Run `bun run setup` to generate keys first.');
    process.exit(1);
  }

  const token = signEd25519Jwt(
    {
      sub: 'local-dev-user',
      email: 'test@example.com',
      name: 'Local Dev User',
      ...(accountId ? { 'custom:account_id': accountId } : {}),
    },
    {
      privateKeyPem,
      issuer,
      expiresIn: 100 * 365 * 24 * 3600, // 100 years for local dev
    }
  );

  process.stdout.write(`Bearer ${token}\n`);
}

// ============================================================================
// Main
// ============================================================================

function parseArgs(argv: string[]): { command?: string; accountId?: string } {
  const result: { command?: string; accountId?: string } = {};

  for (const arg of argv) {
    if (!arg.startsWith('-')) {
      result.command = arg;
      break;
    }
  }

  const idxAccountId = argv.indexOf('--accountId');
  if (idxAccountId >= 0) {
    result.accountId = argv[idxAccountId + 1];
  }

  return result;
}

const args = parseArgs(process.argv.slice(2));

switch (args.command) {
  case 'jwt':
    generateJwt(args.accountId);
    break;
  case 'keys':
    generateKeys().catch((error) => {
      console.error('❌ Error:', error.message);
      process.exit(1);
    });
    break;
  default:
    setupEnvironment().catch((error) => {
      console.error('❌ Error:', error.message);
      process.exit(1);
    });
}
