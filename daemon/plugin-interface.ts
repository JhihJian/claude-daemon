/**
 * plugin-interface.ts
 * 插件系统接口定义
 *
 * 定义了插件的标准接口和相关类型
 */

import type { Logger } from '../lib/logger.ts';
import type { StorageService } from './storage-service.ts';
import type { EventEmitter } from 'events';

// ============================================================================
// 插件接口
// ============================================================================

/**
 * 插件接口
 * 所有插件必须实现此接口
 */
export interface Plugin {
  /** 插件名称（唯一标识） */
  name: string;

  /** 插件版本 */
  version: string;

  /** 插件描述 */
  description?: string;

  /** 插件作者 */
  author?: string;

  /**
   * 插件加载时调用
   * @param context 插件上下文，提供访问 daemon 共享服务的能力
   */
  onLoad(context: PluginContext): Promise<void>;

  /**
   * 插件卸载时调用
   * 用于清理资源
   */
  onUnload(): Promise<void>;

  /**
   * 可选：注册 IPC 命令处理器
   * 返回命令名称到处理器的映射
   */
  registerCommands?(): Map<string, CommandHandler>;

  /**
   * 可选：健康检查
   * 返回插件的健康状态
   */
  healthCheck?(): Promise<PluginHealth>;
}

// ============================================================================
// 插件上下文
// ============================================================================

/**
 * 插件上下文
 * 提供插件访问 daemon 共享服务的能力
 */
export interface PluginContext {
  /** 插件名称 */
  pluginName: string;

  /** 插件配置 */
  config: PluginConfig;

  /** 日志服务 */
  logger: Logger;

  /** 存储服务 */
  storage: StorageService;

  /** 事件总线 */
  eventBus: EventEmitter;

  /**
   * 注册自定义 IPC 命令
   * @param commandName 命令名称（格式：pluginName.commandName）
   * @param handler 命令处理器
   */
  registerIPCCommand(commandName: string, handler: CommandHandler): void;

  /**
   * 取消注册 IPC 命令
   * @param commandName 命令名称
   */
  unregisterIPCCommand(commandName: string): void;

  /**
   * 发送事件到事件总线
   * @param event 事件名称
   * @param data 事件数据
   */
  emit(event: string, data: any): void;

  /**
   * 监听事件总线上的事件
   * @param event 事件名称
   * @param handler 事件处理器
   */
  on(event: string, handler: EventHandler): void;

  /**
   * 取消监听事件
   * @param event 事件名称
   * @param handler 事件处理器
   */
  off(event: string, handler: EventHandler): void;
}

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 插件配置
 */
export interface PluginConfig {
  /** 插件名称 */
  name: string;

  /** 插件路径 */
  path: string;

  /** 是否启用 */
  enabled: boolean;

  /** 自定义配置 */
  config?: Record<string, any>;
}

/**
 * 插件信息
 */
export interface PluginInfo {
  name: string;
  version: string;
  description?: string;
  author?: string;
  status: PluginStatus;
  loadedAt?: number;
}

/**
 * 插件状态
 */
export enum PluginStatus {
  UNLOADED = 'unloaded',
  LOADING = 'loading',
  LOADED = 'loaded',
  ERROR = 'error',
  UNLOADING = 'unloading',
}

/**
 * 插件健康状态
 */
export interface PluginHealth {
  healthy: boolean;
  message?: string;
  details?: Record<string, any>;
}

/**
 * IPC 命令处理器
 */
export type CommandHandler = (request: IPCRequest) => Promise<IPCResponse>;

/**
 * IPC 请求
 */
export interface IPCRequest {
  command: string;
  sessionId?: string;
  data?: any;
}

/**
 * IPC 响应
 */
export interface IPCResponse {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * 事件处理器
 */
export type EventHandler = (data: any) => void | Promise<void>;

/**
 * 插件错误
 */
export class PluginError extends Error {
  constructor(
    public pluginName: string,
    message: string,
    public cause?: Error
  ) {
    super(`[Plugin: ${pluginName}] ${message}`);
    this.name = 'PluginError';
  }
}
