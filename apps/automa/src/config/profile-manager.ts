/**
 * Profile Manager
 * Manages ~/.automa/profiles.json
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getConfigDir, getDefaultProfile, setDefaultProfile } from './config-manager';
import type { Credentials, OAuthConfig, Profile, ProfilesConfig } from './types';

const PROFILES_FILE = join(getConfigDir(), 'profiles.json');

export function loadProfiles(): ProfilesConfig {
  if (!existsSync(PROFILES_FILE)) {
    return { profiles: {} };
  }

  try {
    const content = readFileSync(PROFILES_FILE, 'utf-8');
    return JSON.parse(content) as ProfilesConfig;
  } catch {
    return { profiles: {} };
  }
}

export function saveProfiles(config: ProfilesConfig): void {
  writeFileSync(PROFILES_FILE, JSON.stringify(config, null, 2));
}

export function getProfile(name: string): Profile | undefined {
  const config = loadProfiles();
  return config.profiles[name];
}

export function addProfile(name: string, oauth: OAuthConfig): void {
  const config = loadProfiles();
  config.profiles[name] = {
    oauth,
    credentials: null,
  };
  saveProfiles(config);
}

export function removeProfile(name: string): boolean {
  const config = loadProfiles();
  if (!(name in config.profiles)) {
    return false;
  }
  delete config.profiles[name];
  saveProfiles(config);

  // Clear default if it was this profile
  if (getDefaultProfile() === name) {
    setDefaultProfile('');
  }

  return true;
}

export function updateProfileCredentials(name: string, credentials: Credentials | null): void {
  const config = loadProfiles();
  if (config.profiles[name]) {
    config.profiles[name].credentials = credentials;
    saveProfiles(config);
  }
}

export function listProfiles(): string[] {
  const config = loadProfiles();
  return Object.keys(config.profiles);
}

export function getProfileStatus(
  name: string
): 'logged in' | 'token expired' | 'not logged in' | 'unknown' {
  const profile = getProfile(name);
  if (!profile) {
    return 'unknown';
  }

  if (!profile.credentials) {
    return 'not logged in';
  }

  const expiresAt = new Date(profile.credentials.expiresAt);
  if (expiresAt < new Date()) {
    // Check if we have refresh token
    if (profile.credentials.refreshToken) {
      return 'token expired';
    }
    return 'not logged in';
  }

  return 'logged in';
}

/**
 * Get the current active profile based on:
 * 1. Explicit profile name passed
 * 2. Environment variable AUTOMA_PROFILE
 * 3. Default profile from config
 */
export function getCurrentProfile(explicitProfile?: string): {
  name: string;
  profile: Profile;
} | null {
  const profileName = explicitProfile || process.env.AUTOMA_PROFILE || getDefaultProfile();

  if (!profileName) {
    return null;
  }

  const profile = getProfile(profileName);
  if (!profile) {
    return null;
  }

  return { name: profileName, profile };
}

export function getProfilesPath(): string {
  return PROFILES_FILE;
}
