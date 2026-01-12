#!/usr/bin/env bun
/**
 * Decode and Inspect JWT Token
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';

async function decodeJwt(token: string) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const headerJson = Buffer.from(parts[0], 'base64').toString('utf-8');
  const payloadJson = Buffer.from(parts[1], 'base64').toString('utf-8');

  return {
    header: JSON.parse(headerJson),
    payload: JSON.parse(payloadJson),
    signature: parts[2].substring(0, 20) + '...',
  };
}

async function main() {
  console.log('🔍 JWT Token Inspector\n');

  const cacheFile = path.resolve('.', '.local-jwt-cache');
  const cachedToken = await fs.readFile(cacheFile, 'utf-8').then(t => t.trim());

  const token = cachedToken.replace('Bearer ', '');

  try {
    const decoded = await decodeJwt(token);

    console.log('📋 Token Header:');
    console.log(JSON.stringify(decoded.header, null, 2));

    console.log('\n📋 Token Payload:');
    console.log(JSON.stringify(decoded.payload, null, 2));

    console.log('\n🔐 Signature (first 20 chars):');
    console.log(decoded.signature);

    console.log('\n✅ Token Analysis:');
    console.log(`  - Algorithm: ${decoded.header.alg}`);
    console.log(`  - Type: ${decoded.header.typ}`);
    console.log(`  - Subject (sub): ${decoded.payload.sub}`);
    console.log(`  - Email: ${decoded.payload.email}`);
    console.log(`  - Custom Account ID: ${decoded.payload['custom:account_id'] || 'NOT SET'}`);
    console.log(`  - Issuer: ${decoded.payload.iss}`);

    const now = Math.floor(Date.now() / 1000);
    const expiresIn = decoded.payload.exp - now;
    console.log(`  - Expires in: ${expiresIn > 0 ? expiresIn + 's' : 'EXPIRED'}`);

  } catch (err) {
    console.error('❌ Error:', err);
  }
}

main();
