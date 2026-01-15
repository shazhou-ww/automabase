/**
 * Device Entity
 *
 * Device 代表一个用户设备，每个设备有独立的 Ed25519 密钥对。
 * 一个 Account 可以有多个 Device。
 */

import { ulid } from 'ulid';

/** Device 状态 */
export type DeviceStatus = 'active' | 'revoked';

/**
 * Device 实体
 */
export interface Device {
  // ========== 不可变属性 ==========
  /** 设备 ID (ULID) */
  deviceId: string;

  /** 所属 Account ID */
  accountId: string;

  /** Ed25519 公钥，Base64URL 编码，32 bytes */
  publicKey: string;

  /** 创建时间 */
  createdAt: string;

  // ========== 可变属性 ==========
  /** 设备名称（用户可自定义） */
  deviceName: string;

  /** 设备类型 */
  deviceType?: 'browser' | 'mobile' | 'desktop' | 'server' | 'other';

  /** 设备状态 */
  status: DeviceStatus;

  /** 最后活跃时间 */
  lastActiveAt: string;

  /** 最后更新时间 */
  updatedAt: string;
}

/**
 * 注册 Device 的输入参数
 */
export interface RegisterDeviceInput {
  /** 所属 Account ID */
  accountId: string;

  /** Ed25519 公钥，Base64URL 编码 */
  publicKey: string;

  /** 设备名称 */
  deviceName: string;

  /** 设备类型 */
  deviceType?: 'browser' | 'mobile' | 'desktop' | 'server' | 'other';
}

/**
 * 更新 Device 的输入参数
 */
export interface UpdateDeviceInput {
  /** 设备名称 */
  deviceName?: string;

  /** 设备类型 */
  deviceType?: 'browser' | 'mobile' | 'desktop' | 'server' | 'other';

  /** 设备状态 */
  status?: DeviceStatus;
}

/**
 * Device DynamoDB Item
 *
 * PK: ACCOUNT#{accountId}
 * SK: DEVICE#{deviceId}
 * GSI1PK: DEVICE#PUBKEY#{publicKey}
 * GSI1SK: #META
 */
export interface DeviceItem extends Device {
  pk: string;
  sk: string;
  gsi1pk: string;
  gsi1sk: string;
}

/**
 * 生成新的 Device ID
 */
export function generateDeviceId(): string {
  return ulid();
}
