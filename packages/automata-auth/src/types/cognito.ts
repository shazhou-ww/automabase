/**
 * Cognito JWT Types
 */

/**
 * Cognito Identity 信息
 */
export interface CognitoIdentity {
  providerName: string;
  userId: string;
}

/**
 * Cognito ID Token Claims
 */
export interface CognitoIdTokenClaims {
  /** Issuer (Cognito User Pool URL) */
  iss: string;

  /** Subject (Cognito User ID) */
  sub: string;

  /** Audience (Client ID) */
  aud: string;

  /** Expiration time (Unix timestamp) */
  exp: number;

  /** Issued at (Unix timestamp) */
  iat: number;

  /** Token use */
  token_use: 'id';

  /** Auth time (Unix timestamp) */
  auth_time: number;

  /** Email */
  email?: string;

  /** Email verified */
  email_verified?: boolean;

  /** Name */
  name?: string;

  /** Picture URL */
  picture?: string;

  /** Cognito username */
  'cognito:username'?: string;

  /** External identities (when using federated login) */
  identities?: CognitoIdentity[];

  /** Custom claims - Automabase Account ID */
  'custom:account_id'?: string;

  /** Custom claims - Session Public Key */
  'custom:spk'?: string;
}

/**
 * Cognito Access Token Claims
 */
export interface CognitoAccessTokenClaims {
  /** Issuer (Cognito User Pool URL) */
  iss: string;

  /** Subject (Cognito User ID) */
  sub: string;

  /** Client ID */
  client_id: string;

  /** Token use */
  token_use: 'access';

  /** Scope */
  scope: string;

  /** Expiration time (Unix timestamp) */
  exp: number;

  /** Issued at (Unix timestamp) */
  iat: number;

  /** Auth time (Unix timestamp) */
  auth_time: number;

  /** Username */
  username: string;
}

/**
 * 验证后的用户上下文
 */
export interface AuthContext {
  /** Cognito User ID (sub) */
  cognitoUserId: string;

  /** Automabase Account ID (如果已注册) */
  accountId?: string;

  /** Email */
  email?: string;

  /** Display Name */
  displayName?: string;

  /** Avatar URL */
  avatarUrl?: string;

  /** Session Public Key (如果已设置) */
  sessionPublicKey?: string;

  /** 外部 IdP 信息 */
  identityProvider?: {
    name: string;
    userId: string;
  };
}
