#!/usr/bin/env bun
/**
 * Generate JWT keys for local development
 *
 * Usage: bun run keygen
 *
 * Generates Ed25519 key pair and updates env.json:
 * - LOCAL_JWT_PUBLIC_KEY in function configs (for SAM Local)
 * - LOCAL_JWT_PRIVATE_KEY in E2ETests section (for E2E tests)
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import { resolve } from 'node:path';

/**
 * Generate Ed25519 key pair for local JWT
 */
function generateLocalKeyPair(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return { privateKey, publicKey };
}

const ENV_JSON_PATH = resolve(import.meta.dirname, '..', 'env.json');
const ENV_JSON_EXAMPLE_PATH = resolve(import.meta.dirname, '..', 'env.json.example');

async function main(): Promise<void> {
  let envConfig: Record<string, unknown>;

  // Check if env.json exists
  if (existsSync(ENV_JSON_PATH)) {
    console.log(`📄 Found existing env.json`);
    const content = readFileSync(ENV_JSON_PATH, 'utf-8');
    envConfig = JSON.parse(content);
  } else if (existsSync(ENV_JSON_EXAMPLE_PATH)) {
    // Create from example
    console.log(`📄 env.json not found, creating from env.json.example`);
    const content = readFileSync(ENV_JSON_EXAMPLE_PATH, 'utf-8');
    envConfig = JSON.parse(content);
  } else {
    console.error('❌ Neither env.json nor env.json.example found');
    process.exit(1);
  }

  // Generate Ed25519 key pair for local JWT
  console.log(`🔐 Generating Ed25519 key pair for local JWT...`);
  const keyPair = generateLocalKeyPair();

  // Update function configs with public key (for SAM Local)
  const functionsToUpdate = ['AutomataApiFunction', 'AutomataWsFunction'];

  for (const funcName of functionsToUpdate) {
    let funcConfig = envConfig[funcName] as Record<string, unknown> | undefined;
    if (!funcConfig) {
      funcConfig = {};
      envConfig[funcName] = funcConfig;
    }
    funcConfig.LOCAL_JWT_PUBLIC_KEY = keyPair.publicKey;
    funcConfig.LOCAL_JWT_ISSUER = 'local-dev';
    console.log(`  ✅ Updated ${funcName}`);
  }

  // Store private key in E2ETests section (for E2E tests to read)
  let e2eConfig = envConfig['E2ETests'] as Record<string, unknown> | undefined;
  if (!e2eConfig) {
    e2eConfig = {};
    envConfig['E2ETests'] = e2eConfig;
  }
  e2eConfig.LOCAL_JWT_PRIVATE_KEY = keyPair.privateKey;
  e2eConfig.LOCAL_JWT_PUBLIC_KEY = keyPair.publicKey;
  e2eConfig.LOCAL_JWT_ISSUER = 'local-dev';
  console.log(`  ✅ Updated E2ETests`);

  // Write back to env.json
  writeFileSync(ENV_JSON_PATH, JSON.stringify(envConfig, null, 2) + '\n');

  console.log(`\n💾 Saved to: env.json`);
  console.log(`\n✅ Done! Both SAM Local and E2E tests will read keys from env.json.`);
  console.log(`⚠️  Remember to restart SAM Local to pick up the new keys!`);
}

main().catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
