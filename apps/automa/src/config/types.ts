/**
 * Global configuration types
 */

export interface GlobalConfig {
  admin?: {
    url?: string;
    key?: string;
  };
  api?: {
    url?: string;
  };
  defaultProfile?: string;
}

export interface OAuthConfig {
  issuer: string;
  clientId: string;
  deviceAuthEndpoint: string;
  tokenEndpoint: string;
  scopes: string[];
}

export interface Credentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  tokenType: string;
}

export interface Profile {
  oauth: OAuthConfig;
  credentials?: Credentials | null;
}

export interface ProfilesConfig {
  profiles: Record<string, Profile>;
}

export const DEFAULT_SCOPES = ['openid', 'profile', 'offline_access'];
