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
 * @param eventData - 事件数据
 * @param transition - JSONata 转换表达式
 * @returns 新状态
 */
export async function executeTransition(
  currentState: unknown,
  eventData: unknown,
  transition: string
): Promise<unknown> {
  const expression = getCompiledExpression(transition);

  // 构建输入数据
  // JSONata 约定：$.state 表示当前状态，$.event 表示事件数据
  // 保留 $xxx 命名空间给未来的扩展函数
  const input = {
    state: currentState,
    event: eventData,
  };

  try {
    // 第一个参数是输入数据，通过 $.state 和 $.event 访问
    const newState = await expression.evaluate(input);
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
  const eventDefinition = blueprint.events[eventType];
  if (!eventDefinition) {
    throw new TransitionError(`Unknown event type: ${eventType}`, 'UNKNOWN_EVENT_TYPE');
  }

  // 2. TODO: 验证 eventData 是否符合 eventDefinition.schema
  // 这里可以使用 ajv 等 JSON Schema 验证库

  // 3. 执行转换（使用该事件对应的 transition）
  const newState = await executeTransition(currentState, eventData, eventDefinition.transition);

  // 4. TODO: 验证新状态是否符合 blueprint.state.schema

  return newState;
}

/**
 * 清除表达式缓存（用于测试）
 */
export function clearExpressionCache(): void {
  compiledExpressions.clear();
}

