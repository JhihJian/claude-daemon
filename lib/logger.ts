/**
 * logger.ts
 * 统一的日志系统
 *
 * 功能：
 * - 分级日志（DEBUG、INFO、WARN、ERROR）
 * - 可配置日志级别
 * - 结构化日志输出
 * - 性能友好（不阻塞）
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

interface LoggerOptions {
  level?: LogLevel;
  prefix?: string;
  enableColors?: boolean;
}

class Logger {
  private level: LogLevel;
  private prefix: string;
  private enableColors: boolean;

  constructor(options: LoggerOptions = {}) {
    // 从环境变量读取日志级别
    const envLevel = process.env.SESSION_LOG_LEVEL?.toUpperCase();
    this.level = envLevel ? LogLevel[envLevel as keyof typeof LogLevel] || LogLevel.INFO : (options.level ?? LogLevel.INFO);
    this.prefix = options.prefix || '';
    this.enableColors = options.enableColors ?? true;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const prefix = this.prefix ? `[${this.prefix}] ` : '';

    let output = `${timestamp} ${prefix}${level}: ${message}`;

    if (data !== undefined) {
      if (typeof data === 'object' && data !== null) {
        output += '\n' + JSON.stringify(data, null, 2);
      } else {
        output += ` ${data}`;
      }
    }

    return output;
  }

  private colorize(text: string, colorCode: number): string {
    if (!this.enableColors) return text;
    return `\x1b[${colorCode}m${text}\x1b[0m`;
  }

  debug(message: string, data?: any): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;

    const formatted = this.formatMessage('DEBUG', message, data);
    console.error(this.colorize(formatted, 90)); // Gray
  }

  info(message: string, data?: any): void {
    if (!this.shouldLog(LogLevel.INFO)) return;

    const formatted = this.formatMessage('INFO', message, data);
    console.error(this.colorize(formatted, 36)); // Cyan
  }

  warn(message: string, data?: any): void {
    if (!this.shouldLog(LogLevel.WARN)) return;

    const formatted = this.formatMessage('WARN', message, data);
    console.error(this.colorize(formatted, 33)); // Yellow
  }

  error(message: string, data?: any): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;

    const formatted = this.formatMessage('ERROR', message, data);
    console.error(this.colorize(formatted, 31)); // Red
  }

  /**
   * 记录性能指标
   */
  perf(operation: string, startTime: number): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;

    const duration = Date.now() - startTime;
    this.debug(`Performance: ${operation}`, { duration_ms: duration });
  }

  /**
   * 创建子 Logger（带新前缀）
   */
  child(prefix: string): Logger {
    const childPrefix = this.prefix ? `${this.prefix}:${prefix}` : prefix;
    return new Logger({
      level: this.level,
      prefix: childPrefix,
      enableColors: this.enableColors,
    });
  }

  /**
   * 设置日志级别
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }
}

/**
 * 默认 logger 实例
 */
export const logger = new Logger();

/**
 * 创建带前缀的 logger
 */
export function createLogger(prefix: string, options?: Omit<LoggerOptions, 'prefix'>): Logger {
  return new Logger({ ...options, prefix });
}

/**
 * 用于 Hook 的快速 logger 创建函数
 */
export function createHookLogger(hookName: string): Logger {
  return createLogger(hookName, { level: LogLevel.INFO });
}
