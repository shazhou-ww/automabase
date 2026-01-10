/**
 * E2E Test Setup
 *
 * This file is run before all tests to set up the test environment.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as ed from '@noble/ed25519';
import { config } from './config';

// Configure @noble/ed25519 to use Node.js crypto for SHA-512
// This is required for Node.js/Bun environments
const sha512 = (message: Uint8Array): Uint8Array => {
  return new Uint8Array(createHash('sha512').update(message).digest());
};

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
ed.etc.sha512Async = async (...m) => sha512(ed.etc.concatBytes(...m));

// Load JWT keys from env.json for local testing
function loadKeysFromEnvJson(): void {
  const envJsonPath = resolve(import.meta.dirname, '../../..', 'env.json');

  if (!existsSync(envJsonPath)) {
    console.error('\n❌ env.json not found!');
    console.error('   Run "bun run keygen" first to generate JWT keys.\n');
    process.exit(1);
  }

  const envConfig = JSON.parse(readFileSync(envJsonPath, 'utf-8'));
  const e2eConfig = envConfig.E2ETests;

  if (!e2eConfig?.LOCAL_JWT_PRIVATE_KEY || !e2eConfig?.LOCAL_JWT_PUBLIC_KEY) {
    console.error('\n❌ JWT keys not found in env.json!');
    console.error('   Run "bun run keygen" to generate JWT keys.\n');
    process.exit(1);
  }

  // Set environment variables for helpers.ts to use
  process.env.LOCAL_JWT_PRIVATE_KEY = e2eConfig.LOCAL_JWT_PRIVATE_KEY;
  process.env.LOCAL_JWT_PUBLIC_KEY = e2eConfig.LOCAL_JWT_PUBLIC_KEY;
  process.env.LOCAL_JWT_ISSUER = e2eConfig.LOCAL_JWT_ISSUER || 'local-dev';
}

// Log configuration for debugging
console.log('\n📋 E2E Test Configuration:');
console.log(`   API Base URL: ${config.apiBaseUrl}`);
console.log(`   Is Local: ${config.isLocal}`);
console.log('');

// Load JWT keys for local testing
if (config.isLocal) {
  console.log('⚡ Running against local environment (SAM Local)');
  loadKeysFromEnvJson();
  console.log('🔐 JWT keys loaded from env.json');
} else {
  console.log('☁️  Running against deployed environment');
}
