/**
 * Timing Logger
 *
 * 用于记录请求处理各阶段的耗时，帮助排查性能问题
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const LOG_DIR = path.join(process.cwd(), 'logs');
const TIMING_LOG = path.join(LOG_DIR, 'timing.log');
const SAM_LOG = path.join(LOG_DIR, 'sam.log');

// 确保日志目录存在
try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
} catch { }

/**
 * 格式化时间戳
 */
function timestamp(): string {
  return new Date().toISOString();
}

/**
 * 写入日志文件
 */
function appendLog(file: string, message: string): void {
  const line = `[${timestamp()}] ${message}\n`;
  fs.appendFileSync(file, line);
}

/**
 * 请求计时器
 */
export class RequestTimer {
  private requestId: string;
  private method: string;
  private path: string;
  private startTime: number;
  private marks: Array<{ name: string; time: number; elapsed: number }> = [];

  constructor(requestId: string, method: string, path: string) {
    this.requestId = requestId;
    this.method = method;
    this.path = path;
    this.startTime = performance.now();
    this.mark('request_start');
  }

  /**
   * 标记一个时间点
   */
  mark(name: string): void {
    const now = performance.now();
    const elapsed = now - this.startTime;
    this.marks.push({ name, time: now, elapsed });
  }

  /**
   * 获取自上一个标记以来的耗时
   */
  sinceLast(): number {
    if (this.marks.length < 2) return 0;
    const last = this.marks[this.marks.length - 1];
    const prev = this.marks[this.marks.length - 2];
    return last.time - prev.time;
  }

  /**
   * 记录结束并写入日志
   */
  finish(statusCode: number): void {
    this.mark('request_end');
    const totalTime = performance.now() - this.startTime;

    const lines: string[] = [
      ``,
      `========== Request ${this.requestId} ==========`,
      `${this.method} ${this.path} -> ${statusCode}`,
      `Total: ${totalTime.toFixed(2)}ms`,
      ``,
      `Timeline:`,
    ];

    for (let i = 0; i < this.marks.length; i++) {
      const mark = this.marks[i];
      const delta = i > 0 ? mark.time - this.marks[i - 1].time : 0;
      lines.push(`  [${mark.elapsed.toFixed(2)}ms] ${mark.name} (+${delta.toFixed(2)}ms)`);
    }

    lines.push(`${'='.repeat(50)}`);

    const logContent = lines.join('\n');
    appendLog(TIMING_LOG, logContent);

    // 也输出到控制台（简化版）
    console.log(`[TIMING] ${this.requestId.slice(0, 8)} | Total: ${totalTime.toFixed(0)}ms | Breakdown:`);
    for (let i = 1; i < this.marks.length; i++) {
      const mark = this.marks[i];
      const delta = mark.time - this.marks[i - 1].time;
      if (delta > 1) { // 只显示 > 1ms 的阶段
        console.log(`         -> ${mark.name}: ${delta.toFixed(0)}ms`);
      }
    }
  }
}

/**
 * SAM 调用计时器
 */
export class SamTimer {
  private functionName: string;
  private startTime: number;
  private marks: Array<{ name: string; time: number }> = [];

  constructor(functionName: string) {
    this.functionName = functionName;
    this.startTime = performance.now();
    this.mark('sam_start');
  }

  mark(name: string): void {
    this.marks.push({ name, time: performance.now() });
  }

  finish(success: boolean, extraInfo?: string): void {
    this.mark('sam_end');
    const totalTime = performance.now() - this.startTime;

    const lines: string[] = [
      ``,
      `========== SAM Invoke: ${this.functionName} ==========`,
      `Status: ${success ? 'SUCCESS' : 'FAILED'}`,
      `Total: ${totalTime.toFixed(2)}ms`,
      extraInfo ? `Info: ${extraInfo}` : '',
      ``,
      `Timeline:`,
    ];

    for (let i = 0; i < this.marks.length; i++) {
      const mark = this.marks[i];
      const elapsed = mark.time - this.startTime;
      const delta = i > 0 ? mark.time - this.marks[i - 1].time : 0;
      lines.push(`  [${elapsed.toFixed(2)}ms] ${mark.name} (+${delta.toFixed(2)}ms)`);
    }

    lines.push(`${'='.repeat(50)}`);

    appendLog(SAM_LOG, lines.filter(Boolean).join('\n'));

    // 控制台输出
    console.log(`[SAM] ${this.functionName} | ${success ? '✓' : '✗'} | ${totalTime.toFixed(0)}ms`);
    for (let i = 1; i < this.marks.length; i++) {
      const mark = this.marks[i];
      const delta = mark.time - this.marks[i - 1].time;
      if (delta > 5) { // 只显示 > 5ms 的阶段
        console.log(`      -> ${mark.name}: ${delta.toFixed(0)}ms`);
      }
    }
  }
}

/**
 * 清空日志文件
 */
export function clearLogs(): void {
  try {
    fs.writeFileSync(TIMING_LOG, `=== Timing Log Started at ${timestamp()} ===\n`);
    fs.writeFileSync(SAM_LOG, `=== SAM Log Started at ${timestamp()} ===\n`);
    console.log(`[LOG] Logs cleared. Files: ${LOG_DIR}`);
  } catch (err) {
    console.error('[LOG] Failed to clear logs:', err);
  }
}
