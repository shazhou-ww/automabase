/**
 * Global Configuration Manager
 * Manages ~/.automa/config.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { GlobalConfig } from './types';

const CONFIG_DIR = join(homedir(), '.automa');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadConfig(): GlobalConfig {
  ensureConfigDir();

  if (!existsSync(CONFIG_FILE)) {
    return {};
  }

  try {
    const content = readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(content) as GlobalConfig;
  } catch {
    return {};
  }
}

export function saveConfig(config: GlobalConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function getConfigValue(key: string): unknown {
  const config = loadConfig();
  const keys = key.split('.');
  let value: unknown = config;

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = (value as Record<string, unknown>)[k];
    } else {
      return undefined;
    }
  }

  return value;
}

export function setConfigValue(key: string, value: string): void {
  const config = loadConfig();
  const keys = key.split('.');
  let current: Record<string, unknown> = config as Record<string, unknown>;

  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (!(k in current) || typeof current[k] !== 'object') {
      current[k] = {};
    }
    current = current[k] as Record<string, unknown>;
  }

  current[keys[keys.length - 1]] = value;
  saveConfig(config);
}

export function getAdminUrl(): string | undefined {
  const config = loadConfig();
  return config.admin?.url;
}

export function getAdminKey(): string | undefined {
  const config = loadConfig();
  return config.admin?.key;
}

export function getApiUrl(): string | undefined {
  const config = loadConfig();
  return config.api?.url;
}

export function getDefaultProfile(): string | undefined {
  const config = loadConfig();
  return config.defaultProfile;
}

export function setDefaultProfile(profileName: string): void {
  const config = loadConfig();
  config.defaultProfile = profileName;
  saveConfig(config);
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function getConfigDir(): string {
  return CONFIG_DIR;
}
