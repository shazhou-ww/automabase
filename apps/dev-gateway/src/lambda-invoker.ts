/**
 * Lambda Invoker
 *
 * 支持多种调用模式：
 * - direct: 直接 import 并调用 handler（最快）
 * - sam: 通过 sam local invoke 调用
 * - remote: 调用远程 Lambda endpoint
 */

import * as url from 'node:url';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import * as crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import type { GatewayConfig, LambdaHttpEvent, LambdaWsEvent, LambdaResult } from './types';
import { SamTimer } from './timing-logger';

type LambdaEvent = LambdaHttpEvent | LambdaWsEvent;

/**
 * Handler 缓存
 */
const handlerCache = new Map<string, (event: any, context: any) => Promise<LambdaResult>>();

/**
 * 创建最小 Lambda context
 */
function createLambdaContext() {
  return {
    awsRequestId: crypto.randomUUID(),
    functionName: 'dev-gateway-invoked',
    functionVersion: '$LATEST',
    memoryLimitInMB: '512',
    logGroupName: '/aws/lambda/dev-gateway',
    logStreamName: `dev-gateway-${Date.now()}`,
    getRemainingTimeInMillis: () => 30_000,
    callbackWaitsForEmptyEventLoop: false,
  };
}

/**
 * 直接调用 Lambda handler
 */
async function invokeDirect(handlerPath: string, event: LambdaEvent): Promise<LambdaResult> {
  let handler = handlerCache.get(handlerPath);

  if (!handler) {
    const absolutePath = path.resolve(handlerPath);
    const fileUrl = url.pathToFileURL(absolutePath).toString();
    const mod = await import(fileUrl);
    handler = mod.handler as (evt: any, ctx: any) => Promise<LambdaResult>;
    handlerCache.set(handlerPath, handler);
  }

  const context = createLambdaContext();
  return handler(event, context);
}

/**
 * 通过 SAM Local 调用 Lambda
 */
async function invokeSam(
  config: GatewayConfig,
  functionName: string,
  event: LambdaEvent
): Promise<LambdaResult> {
  const timer = new SamTimer(functionName);

  const samConfig = config.sam!;
  const tmpDir = path.join(os.tmpdir(), 'dev-gateway');
  await fs.mkdir(tmpDir, { recursive: true });
  timer.mark('mkdir');

  const tmpEventPath = path.join(tmpDir, `event-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  await fs.writeFile(tmpEventPath, JSON.stringify(event), 'utf-8');
  timer.mark('write_event_file');

  const args = [
    'local',
    'invoke',
    functionName,
    '--template-file',
    samConfig.templatePath,
    '--env-vars',
    samConfig.envVarsPath,
    '--event',
    tmpEventPath,
    '--skip-pull-image',
  ];

  return new Promise((resolve, reject) => {
    timer.mark('spawn_start');
    const proc = spawn('sam', args, { shell: true });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', async (code) => {
      timer.mark('process_exit');

      // 清理临时文件
      await fs.unlink(tmpEventPath).catch(() => { });
      timer.mark('cleanup');

      if (code !== 0) {
        console.error('[SAM] Invoke failed:', stderr);
        timer.finish(false, `Exit code: ${code}`);
        reject(new Error(`SAM invoke failed with code ${code}: ${stderr}`));
        return;
      }

      try {
        // SAM 输出可能包含日志，需要提取 JSON
        const jsonMatch = stdout.match(/\{[\s\S]*\}(?=\s*$)/);
        if (!jsonMatch) {
          throw new Error('No JSON response found in SAM output');
        }
        timer.mark('parse_response');
        timer.finish(true);
        resolve(JSON.parse(jsonMatch[0]) as LambdaResult);
      } catch (err) {
        timer.finish(false, `Parse error: ${err}`);
        reject(new Error(`Failed to parse SAM response: ${err}`));
      }
    });
  });
}

/**
 * 调用远程 Lambda endpoint
 */
async function invokeRemote(
  endpoint: string,
  functionName: string,
  event: LambdaEvent
): Promise<LambdaResult> {
  const response = await fetch(`${endpoint}/2015-03-31/functions/${functionName}/invocations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  });

  if (!response.ok) {
    throw new Error(`Remote invoke failed: ${response.status} ${await response.text()}`);
  }

  return response.json() as Promise<LambdaResult>;
}

/**
 * Lambda 调用器
 */
export class LambdaInvoker {
  /**
   * 函数名到处理器路径的映射
   */
  private functionPathMap: Record<string, string>;

  /**
   * 函数名到 SAM 函数名的映射
   */
  private samFunctionNameMap: Record<string, string>;

  constructor(private config: GatewayConfig) {
    // 设置函数路径映射
    this.functionPathMap = {
      'automata-api': config.functions.httpApi,
      'automata-ws': config.functions.websocket,
    };

    // 设置 SAM 函数名映射
    this.samFunctionNameMap = {
      'automata-api': config.sam?.httpApiFunctionName || 'AutomataApiFunction',
      'automata-ws': config.sam?.websocketFunctionName || 'AutomataWsFunction',
    };
  }

  /**
   * 获取函数的处理器路径
   */
  private getFunctionPath(functionName: string): string {
    return this.functionPathMap[functionName] || this.config.functions.httpApi;
  }

  /**
   * 获取 SAM 函数名
   */
  private getSamFunctionName(functionName: string): string {
    return this.samFunctionNameMap[functionName] || 'AutomataApiFunction';
  }

  /**
   * 调用 HTTP API Lambda
   */
  async invokeHttpApi(event: LambdaHttpEvent, functionName?: string): Promise<LambdaResult> {
    const name = functionName || 'automata-api';

    switch (this.config.lambdaMode) {
      case 'direct':
        return invokeDirect(this.getFunctionPath(name), event);

      case 'sam':
        return invokeSam(this.config, this.getSamFunctionName(name), event);

      case 'remote':
        return invokeRemote(
          this.config.remoteEndpoint!,
          this.getSamFunctionName(name),
          event
        );

      default:
        throw new Error(`Unknown lambda mode: ${this.config.lambdaMode}`);
    }
  }

  /**
   * 调用 WebSocket Lambda
   */
  async invokeWebSocket(event: LambdaWsEvent, functionName?: string): Promise<LambdaResult> {
    const name = functionName || 'automata-ws';

    switch (this.config.lambdaMode) {
      case 'direct':
        return invokeDirect(this.getFunctionPath(name), event);

      case 'sam':
        return invokeSam(this.config, this.getSamFunctionName(name), event);

      case 'remote':
        return invokeRemote(
          this.config.remoteEndpoint!,
          this.getSamFunctionName(name),
          event
        );

      default:
        throw new Error(`Unknown lambda mode: ${this.config.lambdaMode}`);
    }
  }
}
