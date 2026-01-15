/**
 * Account Entity
 *
 * Account 是平台的核心实体，代表一个用户身份。
 * Account 与 Cognito OAuth sub 一一对应。
 * 每个 Account 可以有多个 Device（每个 Device 有独立的 Ed25519 密钥对）。
 */

import { ulid } from 'ulid';

/** Account 状态 */
export type AccountStatus = 'active' | 'suspended' | 'deleted';

/** OAuth Provider */
export type OAuthProvider = 'google' | 'github' | 'cognito';

/**
 * Account 实体
 */
export interface Account {
  // ========== 不可变属性 ==========
  /** 主键 (ULID) */
  accountId: string;

  /** OAuth Provider 的 sub claim */
  oauthSubject: string;

  /** OAuth Provider 标识 */
  oauthProvider: OAuthProvider;

  /** 创建时间 */
  createdAt: string;

  // ========== 可变属性 ==========
  /** 显示名称 */
  displayName: string;

  /** 邮箱地址 */
  email?: string;

  /** 头像 URL */
  avatarUrl?: string;

  /** 账户状态 */
  status: AccountStatus;

  /** 最后更新时间 */
  updatedAt: string;
}

/**
 * 生成新的 Account ID
 */
export function generateAccountId(): string {
  return ulid();
}

/**
 * 创建 Account 的输入参数
 */
export interface CreateAccountInput {
  /** OAuth Provider 的 sub claim */
  oauthSubject: string;

  /** OAuth Provider 标识 */
  oauthProvider: OAuthProvider;

  /** 显示名称 */
  displayName: string;

  /** 邮箱地址 */
  email?: string;

  /** 头像 URL */
  avatarUrl?: string;
}

/**
 * 更新 Account 的输入参数
 */
export interface UpdateAccountInput {
  /** 显示名称 */
  displayName?: string;

  /** 邮箱地址 */
  email?: string;

  /** 头像 URL */
  avatarUrl?: string;

  /** 账户状态 */
  status?: AccountStatus;
}

/**
 * Account DynamoDB Item
 *
 * PK: ACCOUNT#{accountId}
 * SK: #META
 * GSI1PK: OAUTH#{provider}#{subject}
 * GSI1SK: #META
 */
export interface AccountItem extends Account {
  pk: string;
  sk: string;
  gsi1pk: string;
  gsi1sk: string;
}
