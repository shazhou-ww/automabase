#!/usr/bin/env bun
/**
 * JWT Tool for local development
 *
 * Usage:
 *   bun run jwt              # Generate a new JWT token
 *   bun run jwt init         # Generate key pair and save to env.json (first-time setup)
 *   bun run jwt --accountId xxx  # Generate token with custom accountId
 *
 * Output:
 *   Prints a Bearer token to stdout.
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
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
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
 * Generate Ed25519 key pair and save to env.json
 */
async function initKeys(): Promise<void> {
  let envConfig: Record<string, unknown>;

  // Check if env.json exists
  if (existsSync(ENV_JSON_PATH)) {
    console.log(`📄 Found existing env.json`);
    const content = readFileSync(ENV_JSON_PATH, 'utf-8');
    envConfig = JSON.parse(content);
  } else if (existsSync(ENV_JSON_EXAMPLE_PATH)) {
    console.log(`📄 env.json not found, creating from env.json.example`);
    const content = readFileSync(ENV_JSON_EXAMPLE_PATH, 'utf-8');
    envConfig = JSON.parse(content);
  } else {
    console.error('❌ Neither env.json nor env.json.example found');
    process.exit(1);
  }

  // Generate Ed25519 key pair
  console.log(`🔐 Generating Ed25519 key pair...`);
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
    console.log(`  ✅ Updated ${funcName}`);
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
  console.log(`  ✅ Updated E2ETests`);

  // Write back to env.json
  writeFileSync(ENV_JSON_PATH, `${JSON.stringify(envConfig, null, 2)}\n`);

  console.log(`\n💾 Saved to: env.json`);
  console.log(`\n✅ Done! Restart SAM Local to pick up the new keys.`);
}

/**
 * Generate a new JWT token
 */
function generateToken(accountId?: string): void {
  const fromEnvJson = loadKeysFromEnvJson();

  const privateKeyPem = process.env.LOCAL_JWT_PRIVATE_KEY || fromEnvJson.privateKey;
  const issuer = process.env.LOCAL_JWT_ISSUER || fromEnvJson.issuer || 'local-dev';

  if (!privateKeyPem) {
    console.error(
      '❌ Missing JWT keys.\n\n' +
      'Run `bun run jwt init` to generate keys first.'
    );
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

  // Check for subcommand (first non-flag argument)
  for (const arg of argv) {
    if (!arg.startsWith('-')) {
      result.command = arg;
      break;
    }
  }

  // Check for --accountId
  const idxAccountId = argv.indexOf('--accountId');
  if (idxAccountId >= 0) {
    result.accountId = argv[idxAccountId + 1];
  }

  return result;
}

const args = parseArgs(process.argv.slice(2));

if (args.command === 'init') {
  initKeys().catch((error) => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
} else {
  generateToken(args.accountId);
}
