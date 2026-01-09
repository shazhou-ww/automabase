/**
 * Builtin Blueprints
 *
 * 系统内置的 Blueprint，无需签名，只需验证 hash
 */

import type { BlueprintContent } from '../types/blueprint';
import { computeBlueprintHash } from '../utils/hash';

/**
 * AppRegistry Blueprint - 用于注册 App
 */
export const APP_REGISTRY_BLUEPRINT: BlueprintContent = {
  appId: 'SYSTEM',
  name: 'AppRegistry',
  description: 'System builtin blueprint for app registration',

  stateSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', maxLength: 100 },
      description: { type: 'string', maxLength: 1000 },
      iconUrl: { type: 'string', format: 'uri' },
      websiteUrl: { type: 'string', format: 'uri' },
      status: { enum: ['draft', 'published', 'archived'] },
    },
    required: ['name', 'status'],
  },

  eventSchemas: {
    SET_INFO: {
      type: 'object',
      properties: {
        name: { type: 'string', maxLength: 100 },
        description: { type: 'string', maxLength: 1000 },
        iconUrl: { type: 'string', format: 'uri' },
        websiteUrl: { type: 'string', format: 'uri' },
      },
    },
    PUBLISH: { type: 'object' },
    UNPUBLISH: { type: 'object' },
    ARCHIVE: { type: 'object' },
  },

  initialState: {
    name: 'Untitled App',
    status: 'draft',
  },

  transition: `
    $event.type = 'SET_INFO' ? $merge([$state, $event.data]) :
    $event.type = 'PUBLISH' ? $merge([$state, { "status": "published" }]) :
    $event.type = 'UNPUBLISH' ? $merge([$state, { "status": "draft" }]) :
    $event.type = 'ARCHIVE' ? $merge([$state, { "status": "archived" }]) :
    $state
  `.trim(),
};

/**
 * 所有内置 Blueprint
 */
export const BUILTIN_BLUEPRINTS: Record<string, BlueprintContent> = {
  AppRegistry: APP_REGISTRY_BLUEPRINT,
};

/**
 * 内置 Blueprint hash 缓存
 */
const builtinHashCache: Record<string, string> = {};

/**
 * 获取内置 Blueprint 的 hash
 */
export async function getBuiltinBlueprintHash(name: string): Promise<string> {
  if (builtinHashCache[name]) {
    return builtinHashCache[name];
  }

  const blueprint = BUILTIN_BLUEPRINTS[name];
  if (!blueprint) {
    throw new Error(`Unknown builtin blueprint: ${name}`);
  }

  const hash = await computeBlueprintHash(blueprint);
  builtinHashCache[name] = hash;
  return hash;
}

/**
 * 获取内置 Blueprint 的完整 ID
 */
export async function getBuiltinBlueprintId(name: string): Promise<string> {
  const hash = await getBuiltinBlueprintHash(name);
  return `SYSTEM:${name}:${hash}`;
}

/**
 * 判断是否为已知的内置 Blueprint
 */
export function isKnownBuiltinBlueprint(name: string): boolean {
  return name in BUILTIN_BLUEPRINTS;
}

