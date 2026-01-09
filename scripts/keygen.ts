#!/usr/bin/env bun
/**
 * Generate admin API key for local SAM development
 *
 * Usage: bun run keygen
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const ENV_JSON_PATH = resolve(import.meta.dirname, '..', 'env.json');
const ENV_JSON_EXAMPLE_PATH = resolve(import.meta.dirname, '..', 'env.json.example');

/**
 * Generate a random API key in the format: admin-id:secret
 */
function generateApiKey(): string {
  const adminId = `admin-${randomBytes(4).toString('hex')}`;
  const secret = randomBytes(32).toString('base64url');
  return `${adminId}:${secret}`;
}

function main(): void {
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

  // Check if TenantAdminApiFunction exists
  const tenantAdminConfig = envConfig.TenantAdminApiFunction as
    | Record<string, unknown>
    | undefined;

  if (!tenantAdminConfig) {
    console.error('❌ TenantAdminApiFunction section not found in env.json');
    process.exit(1);
  }

  // Generate new key
  const newKey = generateApiKey();
  tenantAdminConfig.LOCAL_ADMIN_API_KEY = newKey;

  // Write back to env.json
  writeFileSync(ENV_JSON_PATH, JSON.stringify(envConfig, null, 2) + '\n');

  console.log(`✅ Generated new admin API key`);
  console.log(`🔑 Key: ${newKey}`);
  console.log(`💾 Saved to: env.json`);
}

main();
