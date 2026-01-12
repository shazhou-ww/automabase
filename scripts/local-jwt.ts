#!/usr/bin/env bun
/**
 * Generate a locally verifiable JWT for SAM local dev.
 *
 * Reads keys from env vars or from env.json (E2ETests section).
 * Caches the JWT locally to avoid regenerating it every time.
 *
 * Usage:
 *   bun run jwt:local              # Returns cached JWT or generates new one
 *   bun run jwt:local --accountId acc_xxx  # Same with custom accountId
 *   bun run jwt:local --refresh    # Force regenerate and update cache
 *
 * Output:
 *   Prints a Bearer token to stdout.
 */

import * as crypto from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function parseArgs(argv: string[]): { accountId?: string; refresh?: boolean } {
  const result: { accountId?: string; refresh?: boolean } = {};

  const idxAccountId = argv.indexOf('--accountId');
  if (idxAccountId >= 0) {
    result.accountId = argv[idxAccountId + 1];
  }

  if (argv.includes('--refresh')) {
    result.refresh = true;
  }

  return result;
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function signEd25519Jwt(payload: Record<string, unknown>, options: { privateKeyPem: string; issuer: string; expiresIn?: number }) {
  const header = { alg: 'EdDSA', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);

  const claims = {
    ...payload,
    iss: options.issuer,
    iat: now,
    exp: now + (options.expiresIn || 3600), // Local: 100 years, Production: 1 hour
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
  const envPath = resolve(import.meta.dirname, '..', 'env.json');
  if (!existsSync(envPath)) return {};

  const raw = readFileSync(envPath, 'utf-8');
  const parsed = JSON.parse(raw) as Record<string, any>;
  const e2e = parsed.E2ETests as Record<string, any> | undefined;

  return {
    privateKey: e2e?.LOCAL_JWT_PRIVATE_KEY,
    issuer: e2e?.LOCAL_JWT_ISSUER,
  };
}

function getCacheFilePath(): string {
  return resolve(import.meta.dirname, '..', '.local-jwt-cache');
}

function loadCachedToken(): string | null {
  const cachePath = getCacheFilePath();
  if (existsSync(cachePath)) {
    try {
      return readFileSync(cachePath, 'utf-8').trim();
    } catch {
      return null;
    }
  }
  return null;
}

function saveCachedToken(token: string): void {
  const cachePath = getCacheFilePath();
  try {
    writeFileSync(cachePath, token, 'utf-8');
  } catch (err) {
    console.warn('Failed to cache JWT token:', err);
  }
}

const { accountId, refresh } = parseArgs(process.argv.slice(2));

const fromEnvJson = loadKeysFromEnvJson();

const privateKeyPem = process.env.LOCAL_JWT_PRIVATE_KEY || fromEnvJson.privateKey;
const issuer = process.env.LOCAL_JWT_ISSUER || fromEnvJson.issuer || 'local-dev';

if (!privateKeyPem) {
  console.error(
    'Missing LOCAL_JWT_PRIVATE_KEY.\n' +
    'Run `bun run keygen` to generate env.json, or set LOCAL_JWT_PRIVATE_KEY in your environment.'
  );
  process.exit(1);
}

// Check for cached token (unless --refresh is set)
if (!refresh) {
  const cached = loadCachedToken();
  if (cached) {
    process.stdout.write(`${cached}\n`);
    process.exit(0);
  }
}

// Generate new token: 100 years expiration for local dev
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
    expiresIn: 100 * 365 * 24 * 3600, // 100 years for local
  }
);

// Cache the token for future use
saveCachedToken(`Bearer ${token}`);

process.stdout.write(`Bearer ${token}\n`);
