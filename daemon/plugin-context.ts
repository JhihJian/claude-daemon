/**
 * plugin-context.ts
 * 插件上下文实现
 *
 * 为插件提供访问 daemon 共享服务的能力
 */

import { EventEmitter } from 'events';
import type { Logger } from '../lib/logger.ts';
import type { StorageService } from './storage-service.ts';
import type { HookServer } from './hook-server.ts';
import type {
  PluginContext as IPluginContext,
  PluginConfig,
  CommandHandler,
  EventHandler,
} from './plugin-interface.ts';

/**
 * 插件上下文实现
 */
export class PluginContext implements IPluginContext {
  public readonly pluginName: string;
  public readonly config: PluginConfig;
  public readonly logger: Logger;
  public readonly storage: StorageService;
  public readonly eventBus: EventEmitter;

  private commandRegistry: Map<string, CommandHandler>;
  private hookServer: HookServer;
  private eventHandlers: Map<string, Set<EventHandler>>;
  private registeredCommands: Set<string>;

  constructor(
    pluginName: string,
    config: PluginConfig,
    logger: Logger,
    storage: StorageService,
    eventBus: EventEmitter,
    commandRegistry: Map<string, CommandHandler>,
    hookServer: HookServer
  ) {
    this.pluginName = pluginName;
    this.config = config;
    this.logger = logger;
    this.storage = storage;
    this.eventBus = eventBus;
    this.commandRegistry = commandRegistry;
    this.hookServer = hookServer;
    this.eventHandlers = new Map();
    this.registeredCommands = new Set();
  }

  /**
   * 注册 IPC 命令
   */
  registerIPCCommand(commandName: string, handler: CommandHandler): void {
    // 确保命令名称以插件名称为前缀
    const fullCommandName = commandName.startsWith(`${this.pluginName}.`)
      ? commandName
      : `${this.pluginName}.${commandName}`;

    if (this.commandRegistry.has(fullCommandName)) {
      throw new Error(
        `Command "${fullCommandName}" is already registered`
      );
    }

    // 注册到内部命令注册表
    this.commandRegistry.set(fullCommandName, handler);

    // 注册到 HookServer
    this.hookServer.registerCommand(fullCommandName, handler);

    // 记录已注册的命令，用于清理
    this.registeredCommands.add(fullCommandName);

    this.logger.debug(`Registered IPC command: ${fullCommandName}`);
  }

  /**
   * 取消注册 IPC 命令
   */
  unregisterIPCCommand(commandName: string): void {
    const fullCommandName = commandName.startsWith(`${this.pluginName}.`)
      ? commandName
      : `${this.pluginName}.${commandName}`;

    // 从内部注册表移除
    this.commandRegistry.delete(fullCommandName);

    // 从 HookServer 移除
    this.hookServer.unregisterCommand(fullCommandName);

    // 从已注册命令集合中移除
    this.registeredCommands.delete(fullCommandName);

    this.logger.debug(`Unregistered IPC command: ${fullCommandName}`);
  }

  /**
   * 发送事件
   */
  emit(event: string, data: any): void {
    // 为事件名称添加插件前缀，避免冲突
    const fullEventName = `plugin:${this.pluginName}:${event}`;
    this.eventBus.emit(fullEventName, data);
  }

  /**
   * 监听事件
   */
  on(event: string, handler: EventHandler): void {
    const fullEventName = `plugin:${this.pluginName}:${event}`;

    // 记录事件处理器，用于清理
    if (!this.eventHandlers.has(fullEventName)) {
      this.eventHandlers.set(fullEventName, new Set());
    }
    this.eventHandlers.get(fullEventName)!.add(handler);

    this.eventBus.on(fullEventName, handler);
  }

  /**
   * 取消监听事件
   */
  off(event: string, handler: EventHandler): void {
    const fullEventName = `plugin:${this.pluginName}:${event}`;

    const handlers = this.eventHandlers.get(fullEventName);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(fullEventName);
      }
    }

    this.eventBus.off(fullEventName, handler);
  }

  /**
   * 清理所有注册的资源
   * 在插件卸载时调用
   */
  cleanup(): void {
    // 清理所有注册的命令（从内部注册表和 HookServer）
    for (const commandName of this.registeredCommands) {
      this.commandRegistry.delete(commandName);
      this.hookServer.unregisterCommand(commandName);
    }
    this.registeredCommands.clear();

    // 清理所有事件监听器
    for (const [eventName, handlers] of this.eventHandlers) {
      for (const handler of handlers) {
        this.eventBus.off(eventName, handler);
      }
    }
    this.eventHandlers.clear();

    this.logger.debug(`Cleaned up plugin context for: ${this.pluginName}`);
  }
}
