/**
 * Blueprint - 状态机模板（隐式实体）
 *
 * Blueprint 是状态机的模板定义，包含状态 Schema、事件 Schema 和转换逻辑。
 * 作为隐式实体，用户无需显式创建，系统在创建 Automata 时自动去重存储。
 */

import type { JSONSchema7 } from 'json-schema';

/**
 * Blueprint 内容结构
 * 这是用户提交的 Blueprint 定义，用于计算 hash 和签名验证
 */
export interface BlueprintContent {
  /** 归属的 App ID，或 "SYSTEM" 表示系统内置 */
  appId: string;

  /** Blueprint 名称 */
  name: string;

  /** 描述（可选） */
  description?: string;

  /** 状态的 JSON Schema */
  stateSchema: JSONSchema7;

  /** 事件类型 -> JSON Schema 的映射 */
  eventSchemas: Record<string, JSONSchema7>;

  /** 初始状态 */
  initialState: unknown;

  /** JSONata 转换表达式 */
  transition: string;
}

/**
 * Blueprint 实体（存储在 DynamoDB 中）
 */
export interface Blueprint extends BlueprintContent {
  /** 主键：{appId}:{name}:{hash} */
  blueprintId: string;

  /** 开发者的 Ed25519 签名，Base64URL 编码；Builtin 时为 null */
  signature: string | null;

  /** 首次创建该 Blueprint 的 Account ID */
  creatorAccountId: string;

  /** 首次创建时间 */
  createdAt: string; // ISO8601
}

/**
 * DynamoDB Item 结构
 */
export interface BlueprintItem extends Blueprint {
  /** PK: BLUEPRINT#{blueprintId} */
  pk: string;

  /** SK: #META */
  sk: string;

  /** GSI1PK: APP#{appId} - 按 App 查询 Blueprint */
  gsi1pk: string;

  /** GSI1SK: {createdAt}#{name} - 按时间和名称排序 */
  gsi1sk: string;
}

/**
 * 创建 Blueprint 的输入参数
 */
export interface CreateBlueprintInput {
  /** Blueprint 内容 */
  content: BlueprintContent;

  /** 开发者签名（Builtin 时为 null） */
  signature: string | null;

  /** 创建者 Account ID */
  creatorAccountId: string;
}

/**
 * 判断是否为系统内置 Blueprint
 */
export function isBuiltinBlueprint(blueprintId: string): boolean {
  return blueprintId.startsWith('SYSTEM:');
}

/**
 * 解析 Blueprint ID
 * @returns { appId, name, hash }
 */
export function parseBlueprintId(blueprintId: string): {
  appId: string;
  name: string;
  hash: string;
} {
  const parts = blueprintId.split(':');
  if (parts.length !== 3) {
    throw new Error(`Invalid blueprintId format: ${blueprintId}`);
  }
  return {
    appId: parts[0],
    name: parts[1],
    hash: parts[2],
  };
}

