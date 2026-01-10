/**
 * Blueprint Service
 *
 * 处理 Blueprint 的验证、去重存储和复用逻辑
 */

import { getAccountById } from '../db/account-repository';
import { getAutomataById } from '../db/automata-repository';
import { createBlueprintIfNotExists, getBlueprintById } from '../db/blueprint-repository';
import type { Blueprint, BlueprintContent } from '../types/blueprint';
import { computeBlueprintHash, computeBlueprintId } from '../utils/hash';
import { verifyEd25519Signature } from '../utils/signature';
import { BUILTIN_BLUEPRINTS, getBuiltinBlueprintHash } from './builtin-blueprints';

/**
 * Blueprint 验证错误
 */
export class BlueprintValidationError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'BlueprintValidationError';
  }
}

/**
 * 验证并获取/创建 Blueprint
 *
 * 这是创建 Automata 时调用的核心函数：
 * 1. 检查 Blueprint 是否已存在（已验证过签名）
 * 2. 如果存在，直接复用
 * 3. 如果不存在，验证签名后创建
 *
 * @param content - Blueprint 内容
 * @param signature - 开发者签名（Builtin 时为 null）
 * @param creatorAccountId - 创建者 Account ID
 * @returns Blueprint ID
 */
export async function validateAndGetBlueprint(
  content: BlueprintContent,
  signature: string | null,
  creatorAccountId: string
): Promise<string> {
  const blueprintId = await computeBlueprintId(content);

  // 1. 检查 Blueprint 是否已存在
  const existing = await getBlueprintById(blueprintId);
  if (existing) {
    // 已存在：直接复用，无需再次验证签名
    return blueprintId;
  }

  // 2. 不存在：验证后创建

  // 2.1 Builtin Blueprint：验证 hash 匹配
  if (content.appId === 'SYSTEM') {
    await validateBuiltinBlueprint(content);
  } else {
    // 2.2 用户 Blueprint：验证签名
    await validateBlueprintSignature(content, signature);
  }

  // 3. 创建 Blueprint
  await createBlueprintIfNotExists({
    content,
    signature,
    creatorAccountId,
  });

  return blueprintId;
}

/**
 * 验证 Builtin Blueprint
 */
async function validateBuiltinBlueprint(content: BlueprintContent): Promise<void> {
  const builtin = BUILTIN_BLUEPRINTS[content.name];
  if (!builtin) {
    throw new BlueprintValidationError(
      `Unknown builtin blueprint: ${content.name}`,
      'UNKNOWN_BUILTIN'
    );
  }

  // 验证 hash 匹配
  const contentHash = await computeBlueprintHash(content);
  const builtinHash = await getBuiltinBlueprintHash(content.name);

  if (contentHash !== builtinHash) {
    throw new BlueprintValidationError(
      `Builtin blueprint hash mismatch for: ${content.name}`,
      'HASH_MISMATCH'
    );
  }
}

/**
 * 验证 Blueprint 签名
 */
async function validateBlueprintSignature(
  content: BlueprintContent,
  signature: string | null
): Promise<void> {
  if (!signature) {
    throw new BlueprintValidationError(
      'Signature required for non-builtin blueprint',
      'SIGNATURE_REQUIRED'
    );
  }

  // 获取 App（Automata）
  const app = await getAutomataById(content.appId);
  if (!app) {
    throw new BlueprintValidationError(`App not found: ${content.appId}`, 'APP_NOT_FOUND');
  }

  // 获取 App owner 的 Account
  const account = await getAccountById(app.ownerAccountId);
  if (!account) {
    throw new BlueprintValidationError(
      `Account not found: ${app.ownerAccountId}`,
      'ACCOUNT_NOT_FOUND'
    );
  }

  // 验证签名
  const isValid = verifyEd25519Signature(content, signature, account.publicKey);
  if (!isValid) {
    throw new BlueprintValidationError('Invalid blueprint signature', 'INVALID_SIGNATURE');
  }
}

/**
 * 获取 Blueprint（包含验证检查）
 *
 * @param blueprintId - Blueprint ID
 * @returns Blueprint 或 null
 */
export async function getValidatedBlueprint(blueprintId: string): Promise<Blueprint | null> {
  return getBlueprintById(blueprintId);
}
