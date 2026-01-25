/**
 * plugin-manager.ts
 * 插件管理器
 *
 * 负责插件的加载、卸载、生命周期管理
 */

import { EventEmitter } from 'events';
import { existsSync } from 'fs';
import { join } from 'path';
import { createHookLogger } from '../lib/logger.ts';
import type { StorageService } from './storage-service.ts';
import type { HookServer } from './hook-server.ts';
import { PluginContext } from './plugin-context.ts';
import type {
  Plugin,
  PluginConfig,
  PluginInfo,
  PluginHealth,
  PluginError as IPluginError,
  CommandHandler,
} from './plugin-interface.ts';
import { PluginError, PluginStatus } from './plugin-interface.ts';

const logger = createHookLogger('PluginManager');

/**
 * 插件管理器
 */
export class PluginManager {
  private plugins: Map<string, LoadedPlugin>;
  private commandRegistry: Map<string, CommandHandler>;
  private eventBus: EventEmitter;
  private storage: StorageService;
  private hookServer: HookServer;

  constructor(storage: StorageService, eventBus: EventEmitter, hookServer: HookServer) {
    this.plugins = new Map();
    this.commandRegistry = new Map();
    this.eventBus = eventBus;
    this.storage = storage;
    this.hookServer = hookServer;
  }

  /**
   * 加载插件
   */
  async loadPlugin(config: PluginConfig): Promise<void> {
    const { name, path, enabled } = config;

    if (!enabled) {
      logger.info(`Plugin "${name}" is disabled, skipping`);
      return;
    }

    if (this.plugins.has(name)) {
      throw new PluginError(name, 'Plugin is already loaded');
    }

    logger.info(`Loading plugin: ${name}`);

    // 创建插件记录
    const loadedPlugin: LoadedPlugin = {
      name,
      config,
      status: PluginStatus.LOADING,
      instance: null,
      context: null,
      loadedAt: null,
      error: null,
    };

    this.plugins.set(name, loadedPlugin);

    try {
      // 加载插件模块
      const pluginModule = await this.loadPluginModule(path);
      const PluginClass = pluginModule.default || pluginModule;

      // 实例化插件类
      const pluginInstance = new PluginClass();

      if (!this.isValidPlugin(pluginInstance)) {
        throw new Error('Invalid plugin: missing required methods');
      }

      // 创建插件上下文
      const pluginLogger = createHookLogger(`Plugin:${name}`);
      const context = new PluginContext(
        name,
        config,
        pluginLogger,
        this.storage,
        this.eventBus,
        this.commandRegistry,
        this.hookServer
      );

      // 调用插件的 onLoad
      await pluginInstance.onLoad(context);

      // 注册插件的命令（如果有）
      if (pluginInstance.registerCommands) {
        const commands = pluginInstance.registerCommands();
        for (const [commandName, handler] of commands) {
          context.registerIPCCommand(commandName, handler);
        }
      }

      // 更新插件记录
      loadedPlugin.instance = pluginInstance;
      loadedPlugin.context = context;
      loadedPlugin.status = PluginStatus.LOADED;
      loadedPlugin.loadedAt = Date.now();

      logger.info(`Plugin loaded successfully: ${name} v${pluginInstance.version}`);

      // 发送插件加载事件
      this.eventBus.emit('plugin:loaded', { name, version: pluginInstance.version });
    } catch (error) {
      loadedPlugin.status = PluginStatus.ERROR;
      loadedPlugin.error = error instanceof Error ? error.message : String(error);

      // Log detailed error information
      logger.error(`Failed to load plugin: ${name}`);
      logger.error(`Error type: ${error?.constructor?.name || typeof error}`);
      logger.error(`Error message: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof Error && error.stack) {
        logger.error(`Error stack: ${error.stack}`);
      }
      logger.error(`Full error:`, error);

      throw new PluginError(
        name,
        `Failed to load plugin: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * 卸载插件
   */
  async unloadPlugin(name: string): Promise<void> {
    const loadedPlugin = this.plugins.get(name);

    if (!loadedPlugin) {
      throw new PluginError(name, 'Plugin is not loaded');
    }

    if (loadedPlugin.status === PluginStatus.UNLOADING) {
      logger.warn(`Plugin "${name}" is already unloading`);
      return;
    }

    logger.info(`Unloading plugin: ${name}`);

    loadedPlugin.status = PluginStatus.UNLOADING;

    try {
      // 调用插件的 onUnload
      if (loadedPlugin.instance) {
        await loadedPlugin.instance.onUnload();
      }

      // 清理插件上下文
      if (loadedPlugin.context) {
        loadedPlugin.context.cleanup();
      }

      // 从插件列表中移除
      this.plugins.delete(name);

      logger.info(`Plugin unloaded successfully: ${name}`);

      // 发送插件卸载事件
      this.eventBus.emit('plugin:unloaded', { name });
    } catch (error) {
      loadedPlugin.status = PluginStatus.ERROR;
      loadedPlugin.error = error instanceof Error ? error.message : String(error);

      logger.error(`Failed to unload plugin: ${name}`, error);

      throw new PluginError(
        name,
        `Failed to unload plugin: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * 重新加载插件
   */
  async reloadPlugin(name: string): Promise<void> {
    const loadedPlugin = this.plugins.get(name);

    if (!loadedPlugin) {
      throw new PluginError(name, 'Plugin is not loaded');
    }

    const config = loadedPlugin.config;

    await this.unloadPlugin(name);
    await this.loadPlugin(config);
  }

  /**
   * 获取插件
   */
  getPlugin(name: string): Plugin | null {
    const loadedPlugin = this.plugins.get(name);
    return loadedPlugin?.instance || null;
  }

  /**
   * 列出所有插件
   */
  listPlugins(): PluginInfo[] {
    const pluginInfos: PluginInfo[] = [];

    for (const [name, loadedPlugin] of this.plugins) {
      pluginInfos.push({
        name,
        version: loadedPlugin.instance?.version || 'unknown',
        description: loadedPlugin.instance?.description,
        author: loadedPlugin.instance?.author,
        status: loadedPlugin.status,
        loadedAt: loadedPlugin.loadedAt || undefined,
      });
    }

    return pluginInfos;
  }

  /**
   * 获取插件健康状态
   */
  async getPluginHealth(name: string): Promise<PluginHealth> {
    const loadedPlugin = this.plugins.get(name);

    if (!loadedPlugin) {
      return {
        healthy: false,
        message: 'Plugin not found',
      };
    }

    if (loadedPlugin.status !== PluginStatus.LOADED) {
      return {
        healthy: false,
        message: `Plugin status: ${loadedPlugin.status}`,
        details: { error: loadedPlugin.error },
      };
    }

    // 如果插件实现了 healthCheck 方法，调用它
    if (loadedPlugin.instance?.healthCheck) {
      try {
        return await loadedPlugin.instance.healthCheck();
      } catch (error) {
        return {
          healthy: false,
          message: 'Health check failed',
          details: { error: error instanceof Error ? error.message : String(error) },
        };
      }
    }

    return {
      healthy: true,
      message: 'Plugin is loaded',
    };
  }

  /**
   * 处理 IPC 命令
   */
  async handleIPCCommand(command: string, request: any): Promise<any> {
    const handler = this.commandRegistry.get(command);

    if (!handler) {
      return {
        success: false,
        error: `Unknown command: ${command}`,
      };
    }

    try {
      return await handler(request);
    } catch (error) {
      logger.error(`Error handling command: ${command}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 卸载所有插件
   */
  async unloadAll(): Promise<void> {
    logger.info('Unloading all plugins...');

    const pluginNames = Array.from(this.plugins.keys());

    for (const name of pluginNames) {
      try {
        await this.unloadPlugin(name);
      } catch (error) {
        logger.error(`Failed to unload plugin: ${name}`, error);
      }
    }

    logger.info('All plugins unloaded');
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 加载插件模块
   */
  private async loadPluginModule(pluginPath: string): Promise<any> {
    // 检查路径是否存在
    if (!existsSync(pluginPath)) {
      throw new Error(`Plugin path does not exist: ${pluginPath}`);
    }

    // 尝试加载插件入口文件
    const possibleEntries = ['plugin.ts', 'plugin.js', 'index.ts', 'index.js'];

    for (const entry of possibleEntries) {
      const entryPath = join(pluginPath, entry);
      if (existsSync(entryPath)) {
        return await import(entryPath);
      }
    }

    throw new Error(`No valid plugin entry file found in: ${pluginPath}`);
  }

  /**
   * 验证插件是否有效
   */
  private isValidPlugin(plugin: any): plugin is Plugin {
    return (
      plugin &&
      typeof plugin === 'object' &&
      typeof plugin.name === 'string' &&
      typeof plugin.version === 'string' &&
      typeof plugin.onLoad === 'function' &&
      typeof plugin.onUnload === 'function'
    );
  }
}

// ============================================================================
// 内部类型
// ============================================================================

interface LoadedPlugin {
  name: string;
  config: PluginConfig;
  status: PluginStatus;
  instance: Plugin | null;
  context: PluginContext | null;
  loadedAt: number | null;
  error: string | null;
}
