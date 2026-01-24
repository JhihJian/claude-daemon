/**
 * errors.ts
 * 统一的错误处理模块
 *
 * 功能：
 * - 自定义错误类型
 * - 错误恢复策略
 * - 友好的错误消息
 */

import { logger } from './logger.ts';

/**
 * 基础错误类
 */
export class SessionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable: boolean = true,
    public readonly context?: Record<string, any>
  ) {
    super(message);
    this.name = 'SessionError';
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      recoverable: this.recoverable,
      context: this.context,
    };
  }
}

/**
 * 文件系统错误
 */
export class FileSystemError extends SessionError {
  constructor(message: string, filePath: string, operation: string) {
    super(message, 'FS_ERROR', true, { filePath, operation });
    this.name = 'FileSystemError';
  }
}

/**
 * 解析错误
 */
export class ParseError extends SessionError {
  constructor(message: string, data: string) {
    super(message, 'PARSE_ERROR', true, { data: data.slice(0, 100) });
    this.name = 'ParseError';
  }
}

/**
 * 配置错误
 */
export class ConfigError extends SessionError {
  constructor(message: string, configKey?: string) {
    super(message, 'CONFIG_ERROR', false, { configKey });
    this.name = 'ConfigError';
  }
}

/**
 * 超时错误
 */
export class TimeoutError extends SessionError {
  constructor(operation: string, timeout: number) {
    super(`Operation timed out: ${operation}`, 'TIMEOUT_ERROR', true, {
      operation,
      timeout,
    });
    this.name = 'TimeoutError';
  }
}

/**
 * 执行带超时的异步操作
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeout: number,
  operation: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new TimeoutError(operation, timeout)), timeout)
    ),
  ]);
}

/**
 * 安全执行函数（捕获并记录错误，但不抛出）
 */
export async function safeExecute<T>(
  fn: () => Promise<T> | T,
  fallback: T,
  context: string
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    logger.error(`Error in ${context}`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return fallback;
  }
}

/**
 * 重试执行函数
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delay?: number;
    backoff?: number;
    context?: string;
  } = {}
): Promise<T> {
  const { maxAttempts = 3, delay = 1000, backoff = 2, context = 'operation' } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxAttempts) {
        const waitTime = delay * Math.pow(backoff, attempt - 1);
        logger.warn(`Retry ${attempt}/${maxAttempts} for ${context}`, {
          error: lastError.message,
          nextRetryIn: waitTime,
        });
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  throw lastError || new Error(`Failed after ${maxAttempts} attempts`);
}

/**
 * Hook 错误处理包装器
 * 确保 Hook 永远不会阻塞 Claude Code
 */
export function hookErrorHandler(hookName: string) {
  return (error: unknown): void => {
    // 记录错误但不抛出
    logger.error(`Hook ${hookName} failed`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      recoverable: error instanceof SessionError ? error.recoverable : true,
    });

    // Hook 失败不应阻塞 Claude Code
    // 只记录到 stderr，让系统继续运行
  };
}

/**
 * 验证函数
 */
export function validateRequired<T>(
  value: T | null | undefined,
  fieldName: string
): T {
  if (value === null || value === undefined) {
    throw new ConfigError(`Required field missing: ${fieldName}`, fieldName);
  }
  return value;
}

/**
 * 验证文件路径
 */
export function validatePath(path: string, fieldName: string = 'path'): string {
  if (!path || typeof path !== 'string') {
    throw new ConfigError(`Invalid path: ${fieldName}`, fieldName);
  }
  if (path.includes('\0')) {
    throw new ConfigError(`Path contains null bytes: ${fieldName}`, fieldName);
  }
  return path;
}

/**
 * 安全的 JSON 解析
 */
export function safeJSONParse<T>(
  data: string,
  fallback: T,
  context: string = 'JSON'
): T {
  try {
    return JSON.parse(data) as T;
  } catch (error) {
    logger.warn(`Failed to parse ${context}`, {
      error: error instanceof Error ? error.message : String(error),
      dataPreview: data.slice(0, 100),
    });
    return fallback;
  }
}
