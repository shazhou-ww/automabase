/**
 * E2E Test Setup
 *
 * This file is run before all tests to set up the test environment.
 */

import { config } from './config';
import { createHash } from 'node:crypto';
import * as ed from '@noble/ed25519';

// Configure @noble/ed25519 to use Node.js crypto for SHA-512
// This is required for Node.js/Bun environments
const sha512 = (message: Uint8Array): Uint8Array => {
  return new Uint8Array(createHash('sha512').update(message).digest());
};

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
ed.etc.sha512Async = async (...m) => sha512(ed.etc.concatBytes(...m));

// Log configuration for debugging
console.log('\n📋 E2E Test Configuration:');
console.log(`   API Base URL: ${config.apiBaseUrl}`);
console.log(`   Is Local: ${config.isLocal}`);
console.log('');

// Increase timeout for API calls if needed
if (config.isLocal) {
  // Local SAM may be slower due to cold starts
  console.log('⚡ Running against local environment (SAM Local)');
} else {
  console.log('☁️  Running against deployed environment');
}
