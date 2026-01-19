/**
 * E2E Test Setup
 *
 * This file is run before all tests to set up the test environment.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as ed from '@noble/ed25519';
import { beforeAll } from 'vitest';
import { config } from './config';

// Configure @noble/ed25519 to use Node.js crypto for SHA-512
// This is required for Node.js/Bun environments
const sha512 = (message: Uint8Array): Uint8Array => {
  return new Uint8Array(createHash('sha512').update(message).digest());
};

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
ed.etc.sha512Async = async (...m) => sha512(ed.etc.concatBytes(...m));

// Global service availability state
interface ServiceStatus {
  available: boolean;
  error?: string;
  checked: boolean;
}

const serviceStatus: ServiceStatus = {
  available: false,
  error: undefined,
  checked: false,
};

/**
 * Check if the API service is available
 */
async function checkServiceHealth(): Promise<ServiceStatus> {
  if (serviceStatus.checked) {
    return serviceStatus;
  }

  const healthUrl = `${config.apiBaseUrl}/health`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(healthUrl, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      serviceStatus.available = true;
      serviceStatus.checked = true;
      return serviceStatus;
    }

    serviceStatus.available = false;
    serviceStatus.error = `Service returned status ${response.status}`;
    serviceStatus.checked = true;
    return serviceStatus;
  } catch (error) {
    serviceStatus.available = false;
    serviceStatus.checked = true;

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        serviceStatus.error = `Service health check timed out (${healthUrl})`;
      } else if (
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('fetch failed')
      ) {
        serviceStatus.error = `Service is not running at ${config.apiBaseUrl}`;
      } else {
        serviceStatus.error = error.message;
      }
    } else {
      serviceStatus.error = 'Unknown error during health check';
    }

    return serviceStatus;
  }
}

// Load JWT keys from env.json for local testing
function loadKeysFromEnvJson(): void {
  const envJsonPath = resolve(import.meta.dirname, '../..', 'env.json');

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

// Load JWT keys for local testing
if (config.isLocal) {
  loadKeysFromEnvJson();
}

// Global beforeAll hook to check service availability
beforeAll(async () => {
  const status = await checkServiceHealth();

  if (!status.available) {
    const errorMessage = [
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      '  ❌ E2E 测试已跳过：服务未启动',
      '',
      `  错误: ${status.error}`,
      '',
      '  请先启动开发服务器:',
      '',
      '    bun run dev',
      '',
      '  或者使用 SAM Local:',
      '',
      '    sam local start-api',
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
    ].join('\n');

    console.error(errorMessage);

    throw new Error(
      `E2E tests skipped: Service is not available. ${status.error}\n` +
        'Please start the dev server with "bun run dev" before running E2E tests.'
    );
  }

  console.log(`\n✅ Service health check passed (${config.apiBaseUrl})\n`);
});
