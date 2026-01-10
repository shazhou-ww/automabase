/**
 * State Transition Engine
 *
 * 使用 JSONata 执行状态转换
 */

import jsonata from 'jsonata';
import type { BlueprintContent } from '../types/blueprint';

/**
 * 转换引擎错误
 */
export class TransitionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'TransitionError';
  }
}

/**
 * 编译后的转换表达式缓存
 */
const compiledExpressions = new Map<string, jsonata.Expression>();

/**
 * 获取或编译 JSONata 表达式
 */
function getCompiledExpression(transition: string): jsonata.Expression {
  let compiled = compiledExpressions.get(transition);
  if (!compiled) {
    try {
      compiled = jsonata(transition);
      compiledExpressions.set(transition, compiled);
    } catch (error) {
      throw new TransitionError(
        `Invalid JSONata expression: ${(error as Error).message}`,
        'INVALID_EXPRESSION',
        error
      );
    }
  }
  return compiled;
}

/**
 * 执行状态转换
 *
 * @param currentState - 当前状态
 * @param eventType - 事件类型
 * @param eventData - 事件数据
 * @param transition - JSONata 转换表达式
 * @returns 新状态
 */
export async function executeTransition(
  currentState: unknown,
  eventType: string,
  eventData: unknown,
  transition: string
): Promise<unknown> {
  const expression = getCompiledExpression(transition);

  // 构建变量绑定
  // JSONata 的 evaluate(input, bindings) 中，bindings 用于绑定 $xxx 变量
  const bindings = {
    state: currentState,
    event: {
      type: eventType,
      data: eventData,
    },
  };

  try {
    // 第一个参数是输入数据（这里传空对象，因为我们通过 bindings 传递所有数据）
    // 第二个参数是变量绑定，$state 和 $event 会自动绑定
    const newState = await expression.evaluate({}, bindings);
    return newState;
  } catch (error) {
    throw new TransitionError(
      `Transition execution failed: ${(error as Error).message}`,
      'EXECUTION_FAILED',
      error
    );
  }
}

/**
 * 验证转换表达式是否有效
 */
export function validateTransitionExpression(transition: string): {
  valid: boolean;
  error?: string;
} {
  try {
    jsonata(transition);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: (error as Error).message,
    };
  }
}

/**
 * 执行完整的事件处理流程
 *
 * @param blueprint - Blueprint 内容
 * @param currentState - 当前状态
 * @param eventType - 事件类型
 * @param eventData - 事件数据
 * @returns 新状态
 */
export async function processEvent(
  blueprint: BlueprintContent,
  currentState: unknown,
  eventType: string,
  eventData: unknown
): Promise<unknown> {
  // 1. 验证事件类型是否在 Blueprint 中定义
  if (!blueprint.eventSchemas[eventType]) {
    throw new TransitionError(`Unknown event type: ${eventType}`, 'UNKNOWN_EVENT_TYPE');
  }

  // 2. TODO: 验证 eventData 是否符合 schema
  // 这里可以使用 ajv 等 JSON Schema 验证库

  // 3. 执行转换
  const newState = await executeTransition(
    currentState,
    eventType,
    eventData,
    blueprint.transition
  );

  // 4. TODO: 验证新状态是否符合 stateSchema

  return newState;
}

/**
 * 清除表达式缓存（用于测试）
 */
export function clearExpressionCache(): void {
  compiledExpressions.clear();
}

