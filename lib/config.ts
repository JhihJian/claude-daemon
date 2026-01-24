/**
 * config.ts
 * 统一的配置管理模块
 *
 * 功能：
 * - 集中管理所有配置项
 * - 支持环境变量覆盖
 * - 提供默认值
 */

import { join } from 'path';
import { homedir } from 'os';
import { existsSync, readFileSync } from 'fs';
import { safeJSONParse } from './errors.ts';

export interface SessionConfig {
  // 路径配置
  paiDir: string;
  sessionsDir: string;
  rawDir: string;
  analysisDir: string;
  summariesDir: string;
  indexDir: string;

  // 行为配置
  maxOutputLength: number;
  hookTimeout: number;
  gitTimeout: number;

  // 分类阈值
  classificationThresholds: {
    coding: number;        // Edit/Write 占比
    debugging: number;     // 测试命令 + Read > Edit
    research: number;      // Search 占比
    writing: number;       // Markdown 文件编辑占比
    git: number;          // Git 命令占比
  };

  // 日志配置
  logLevel: string;

  // 性能配置
  enableCache: boolean;
  cacheTTL: number;
}

class ConfigManager {
  private config: SessionConfig;
  private configFilePath?: string;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): SessionConfig {
    // 默认配置
    const defaults: SessionConfig = {
      // 路径配置
      paiDir: process.env.PAI_DIR || join(homedir(), '.claude'),
      sessionsDir: '',
      rawDir: '',
      analysisDir: '',
      summariesDir: '',
      indexDir: '',

      // 行为配置
      maxOutputLength: parseInt(process.env.MAX_OUTPUT_LENGTH || '5000', 10),
      hookTimeout: parseInt(process.env.HOOK_TIMEOUT || '10000', 10),
      gitTimeout: parseInt(process.env.GIT_TIMEOUT || '3000', 10),

      // 分类阈值
      classificationThresholds: {
        coding: parseFloat(process.env.THRESHOLD_CODING || '0.4'),
        debugging: parseFloat(process.env.THRESHOLD_DEBUGGING || '0.0'),
        research: parseFloat(process.env.THRESHOLD_RESEARCH || '0.3'),
        writing: parseFloat(process.env.THRESHOLD_WRITING || '0.5'),
        git: parseFloat(process.env.THRESHOLD_GIT || '0.5'),
      },

      // 日志配置
      logLevel: process.env.SESSION_LOG_LEVEL || 'INFO',

      // 性能配置
      enableCache: process.env.ENABLE_CACHE !== 'false',
      cacheTTL: parseInt(process.env.CACHE_TTL || '300000', 10), // 5 分钟
    };

    // 计算派生路径
    defaults.sessionsDir = join(defaults.paiDir, 'SESSIONS');
    defaults.rawDir = join(defaults.sessionsDir, 'raw');
    defaults.analysisDir = join(defaults.sessionsDir, 'analysis');
    defaults.summariesDir = join(defaults.analysisDir, 'summaries');
    defaults.indexDir = join(defaults.sessionsDir, 'index');

    // 尝试从配置文件加载
    this.configFilePath = join(defaults.paiDir, 'session-config.json');
    if (existsSync(this.configFilePath)) {
      try {
        const fileContent = readFileSync(this.configFilePath, 'utf-8');
        const fileConfig = safeJSONParse<Partial<SessionConfig>>(
          fileContent,
          {},
          'session-config.json'
        );

        // 合并配置（文件配置优先，但环境变量最优先）
        return this.mergeConfig(defaults, fileConfig);
      } catch (error) {
        // 配置文件加载失败，使用默认配置
        console.error('[Config] Failed to load config file, using defaults');
      }
    }

    return defaults;
  }

  private mergeConfig(defaults: SessionConfig, fileConfig: Partial<SessionConfig>): SessionConfig {
    return {
      ...defaults,
      ...fileConfig,
      // 确保环境变量优先
      paiDir: process.env.PAI_DIR || fileConfig.paiDir || defaults.paiDir,
      maxOutputLength: parseInt(
        process.env.MAX_OUTPUT_LENGTH ||
        String(fileConfig.maxOutputLength || defaults.maxOutputLength),
        10
      ),
      hookTimeout: parseInt(
        process.env.HOOK_TIMEOUT ||
        String(fileConfig.hookTimeout || defaults.hookTimeout),
        10
      ),
      gitTimeout: parseInt(
        process.env.GIT_TIMEOUT ||
        String(fileConfig.gitTimeout || defaults.gitTimeout),
        10
      ),
      logLevel: process.env.SESSION_LOG_LEVEL || fileConfig.logLevel || defaults.logLevel,
      enableCache: process.env.ENABLE_CACHE !== 'false' &&
        (fileConfig.enableCache ?? defaults.enableCache),
      cacheTTL: parseInt(
        process.env.CACHE_TTL ||
        String(fileConfig.cacheTTL || defaults.cacheTTL),
        10
      ),
    };
  }

  /**
   * 获取配置
   */
  get(): SessionConfig {
    return { ...this.config };
  }

  /**
   * 获取特定配置项
   */
  getPath(key: keyof Pick<SessionConfig, 'paiDir' | 'sessionsDir' | 'rawDir' | 'analysisDir' | 'summariesDir' | 'indexDir'>): string {
    return this.config[key];
  }

  /**
   * 获取会话文件路径
   */
  getSessionFilePath(sessionId: string, yearMonth: string): string {
    return join(this.config.rawDir, yearMonth, `session-${sessionId}.jsonl`);
  }

  /**
   * 获取摘要文件路径
   */
  getSummaryFilePath(sessionId: string, yearMonth: string): string {
    return join(this.config.summariesDir, yearMonth, `summary-${sessionId}.json`);
  }

  /**
   * 获取类型索引路径
   */
  getTypeIndexPath(sessionType: string): string {
    return join(this.config.analysisDir, 'by-type', sessionType, 'sessions.json');
  }

  /**
   * 获取目录索引路径
   */
  getDirectoryIndexPath(dirHash: string): string {
    return join(this.config.analysisDir, 'by-directory', dirHash, 'sessions.json');
  }

  /**
   * 获取全局元数据路径
   */
  getMetadataPath(): string {
    return join(this.config.indexDir, 'metadata.json');
  }

  /**
   * 获取年月字符串
   */
  getYearMonth(date: Date = new Date()): string {
    return date.toISOString().slice(0, 7);
  }

  /**
   * 重新加载配置
   */
  reload(): void {
    this.config = this.loadConfig();
  }
}

/**
 * 全局配置实例
 */
export const config = new ConfigManager();

/**
 * 便捷函数
 */
export function getConfig(): SessionConfig {
  return config.get();
}
