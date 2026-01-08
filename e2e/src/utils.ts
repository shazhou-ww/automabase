/**
 * E2E Test Utilities
 */

import { config } from './config';

export interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: {
    error: string;
    message: string;
  };
}

/**
 * Make an API request
 */
export async function apiRequest<T>(
  method: string,
  path: string,
  options: {
    headers?: Record<string, string>;
    body?: unknown;
  } = {}
): Promise<ApiResponse<T>> {
  const url = `${config.baseUrl}${path}`;

  const response = await fetch(url, {
    method,
    headers: options.headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(config.timeout),
  });

  const text = await response.text();
  let data: T | undefined;
  let error: ApiResponse['error'] | undefined;

  if (text) {
    try {
      const json = JSON.parse(text);
      if (response.ok) {
        data = json as T;
      } else {
        error = json as ApiResponse['error'];
      }
    } catch {
      // Not JSON
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
    error,
  };
}

/**
 * Generate a unique test identifier
 */
export function uniqueId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
