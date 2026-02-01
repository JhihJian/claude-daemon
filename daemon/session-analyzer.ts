/**
 * session-analyzer.ts
 * 会话分析服务 - 实时分析会话类型和提取关键信息
 */

import { createHookLogger } from '../lib/logger.ts';
import { StorageService } from './storage-service.ts';
import type { SessionRegistry } from './session-registry.ts';

const logger = createHookLogger('SessionAnalyzer');

export type SessionType =
  | 'coding'
  | 'debugging'
  | 'research'
  | 'writing'
  | 'git'
  | 'refactoring'
  | 'mixed';

export interface SessionSummary {
  session_id: string;
  timestamp: string;
  agent_name: string;
  working_directory: string;
  git_repo: string | null;
  git_branch: string | null;
  hostname: string;
  user: string;
  platform: string;
  session_type: SessionType;
  duration_seconds: number;
  total_tools: number;
  success_rate: number;
  files_modified: string[];
  tool_usage: Record<string, number>;
  summary_text: string;
  conversation?: {
    user_messages: string[];
    assistant_responses: string[];
    message_count: number;
  };
}

export class SessionAnalyzer {
  private storage: StorageService;
  private sessionRegistry?: SessionRegistry;
  private activeSessions: Map<string, ActiveSession> = new Map();

  constructor(storage: StorageService) {
    this.storage = storage;
  }

  /**
   * Set SessionRegistry reference for agent name lookup
   */
  setSessionRegistry(registry: SessionRegistry): void {
    this.sessionRegistry = registry;
  }

  /**
   * 处理会话启动事件
   */
  async onSessionStart(sessionId: string, data: any): Promise<void> {
    const session: ActiveSession = {
      session_id: sessionId,
      start_time: Date.now(),
      start_data: data,
      tool_events: [],
      files_modified: new Set(),
    };

    this.activeSessions.set(sessionId, session);

    logger.info('Session tracking started', {
      sessionId,
      workingDir: data.working_directory,
      user: data.user,
      hostname: data.hostname,
    });
  }

  /**
   * 处理工具使用事件
   */
  async onToolUse(sessionId: string, data: any): Promise<void> {
    const session = this.activeSessions.get(sessionId);

    if (!session) {
      logger.warn('Tool use for unknown session', { sessionId });
      return;
    }

    // 记录工具事件
    session.tool_events.push({
      tool_name: data.tool_name,
      success: data.success || false,
      timestamp: Date.now(),
      tool_input: data.tool_input,
    });

    // 记录文件修改
    if (data.tool_name === 'Edit' || data.tool_name === 'Write') {
      const filePath = data.tool_input?.file_path;
      if (filePath) {
        session.files_modified.add(filePath);
      }
    }
  }

  /**
   * 处理会话结束事件
   */
  async onSessionEnd(sessionId: string, data?: any): Promise<SessionSummary | null> {
    const session = this.activeSessions.get(sessionId);

    if (!session) {
      logger.warn('Session end for unknown session', { sessionId });
      return null;
    }

    // 分析会话
    const summary = await this.analyzeSession(session, data);

    // 保存摘要
    await this.storage.saveSummary(sessionId, summary);

    // 更新索引
    await this.updateIndexes(summary);

    // 清理活跃会话
    this.activeSessions.delete(sessionId);

    logger.info('Session analyzed and saved', {
      sessionId,
      type: summary.session_type,
      duration: summary.duration_seconds,
      tools: summary.total_tools,
    });

    return summary;
  }

  /**
   * 分析会话
   */
  private async analyzeSession(session: ActiveSession, endData?: any): Promise<SessionSummary> {
    const duration = Math.round((Date.now() - session.start_time) / 1000);
    const sessionType = this.classifySession(session.tool_events);
    const toolUsage = this.analyzeToolUsage(session.tool_events);
    const successRate = this.calculateSuccessRate(session.tool_events);

    // Look up agent name from SessionRegistry
    let agentName = 'default';
    if (this.sessionRegistry) {
      const sessionRecord = this.sessionRegistry.get(session.session_id);
      if (sessionRecord) {
        agentName = sessionRecord.agent_name;
      }
    }

    return {
      session_id: session.session_id,
      timestamp: new Date(session.start_time).toISOString(),
      agent_name: agentName,

      // 上下文信息
      working_directory: session.start_data.working_directory || 'unknown',
      git_repo: session.start_data.git_repo || null,
      git_branch: session.start_data.git_branch || null,
      hostname: session.start_data.hostname || 'unknown',
      user: session.start_data.user || 'unknown',
      platform: session.start_data.platform || 'unknown',

      // 分析结果
      session_type: sessionType,
      duration_seconds: duration,
      total_tools: session.tool_events.length,
      success_rate: successRate,
      files_modified: Array.from(session.files_modified),
      tool_usage: toolUsage,
      summary_text: this.generateSummaryText(sessionType, session),

      // 对话内容（如果有）
      conversation: endData?.conversation,
    };
  }

  /**
   * 构建活跃会话摘要
   */
  private buildActiveSummary(session: ActiveSession): SessionSummary {
    const duration = Math.round((Date.now() - session.start_time) / 1000);
    const sessionType = this.classifySession(session.tool_events);
    const toolUsage = this.analyzeToolUsage(session.tool_events);
    const successRate = this.calculateSuccessRate(session.tool_events);
    const fileCount = session.files_modified.size;

    // Look up agent name from SessionRegistry
    let agentName = 'default';
    if (this.sessionRegistry) {
      const sessionRecord = this.sessionRegistry.get(session.session_id);
      if (sessionRecord) {
        agentName = sessionRecord.agent_name;
      }
    }

    return {
      session_id: session.session_id,
      timestamp: new Date(session.start_time).toISOString(),
      agent_name: agentName,
      working_directory: session.start_data.working_directory || 'unknown',
      git_repo: session.start_data.git_repo || null,
      git_branch: session.start_data.git_branch || null,
      hostname: session.start_data.hostname || 'unknown',
      user: session.start_data.user || 'unknown',
      platform: session.start_data.platform || 'unknown',
      session_type: sessionType,
      duration_seconds: duration,
      total_tools: session.tool_events.length,
      success_rate: successRate,
      files_modified: Array.from(session.files_modified),
      tool_usage: toolUsage,
      summary_text: `Active ${sessionType} session (${session.tool_events.length} tool ops, ${fileCount} file(s) modified)`,
    };
  }

  /**
   * 分类会话类型
   */
  private classifySession(toolEvents: ToolEvent[]): SessionType {
    if (toolEvents.length === 0) return 'mixed';

    const toolCounts: Record<string, number> = {};
    const bashCommands: string[] = [];

    for (const event of toolEvents) {
      toolCounts[event.tool_name] = (toolCounts[event.tool_name] || 0) + 1;

      if (event.tool_name === 'Bash' && event.tool_input?.command) {
        bashCommands.push(event.tool_input.command);
      }
    }

    const editCount = (toolCounts['Edit'] || 0) + (toolCounts['Write'] || 0);
    const readCount = toolCounts['Read'] || 0;
    const searchCount = (toolCounts['Grep'] || 0) + (toolCounts['Glob'] || 0);
    const bashCount = toolCounts['Bash'] || 0;

    // Git 操作检测
    const gitCommandCount = bashCommands.filter(cmd =>
      cmd.includes('git ') || cmd.startsWith('git')
    ).length;

    if (gitCommandCount > bashCount * 0.5) {
      return 'git';
    }

    // 测试/调试检测
    const testCommandCount = bashCommands.filter(cmd =>
      cmd.includes('test') || cmd.includes('npm test') ||
      cmd.includes('pytest') || cmd.includes('jest') ||
      cmd.includes('bun test')
    ).length;

    if (testCommandCount > 0 && readCount > editCount) {
      return 'debugging';
    }

    // 编码检测
    if (editCount > toolEvents.length * 0.4) {
      return 'coding';
    }

    // 研究检测
    if (searchCount > toolEvents.length * 0.3 && readCount > editCount) {
      return 'research';
    }

    return 'mixed';
  }

  /**
   * 分析工具使用情况
   */
  private analyzeToolUsage(toolEvents: ToolEvent[]): Record<string, number> {
    const usage: Record<string, number> = {};

    for (const event of toolEvents) {
      usage[event.tool_name] = (usage[event.tool_name] || 0) + 1;
    }

    return usage;
  }

  /**
   * 计算成功率
   */
  private calculateSuccessRate(toolEvents: ToolEvent[]): number {
    if (toolEvents.length === 0) return 0;

    const successCount = toolEvents.filter(e => e.success).length;
    return Math.round((successCount / toolEvents.length) * 100);
  }

  /**
   * 生成摘要文本
   */
  private generateSummaryText(sessionType: SessionType, session: ActiveSession): string {
    const toolCount = session.tool_events.length;
    const fileCount = session.files_modified.size;

    let summary = `${sessionType} session with ${toolCount} tool operations`;

    if (fileCount > 0) {
      summary += `, modified ${fileCount} file(s)`;
    }

    return summary;
  }

  /**
   * 更新所有索引
   */
  private async updateIndexes(summary: SessionSummary): Promise<void> {
    // 更新类型索引
    await this.storage.updateTypeIndex(summary.session_type, {
      session_id: summary.session_id,
      timestamp: summary.timestamp,
      working_directory: summary.working_directory,
      duration_seconds: summary.duration_seconds,
      total_tools: summary.total_tools,
      success_rate: summary.success_rate,
      summary_text: summary.summary_text,
    });

    // 更新目录索引
    if (summary.working_directory) {
      await this.storage.updateDirectoryIndex(summary.working_directory, {
        session_id: summary.session_id,
        timestamp: summary.timestamp,
        session_type: summary.session_type,
        duration_seconds: summary.duration_seconds,
        total_tools: summary.total_tools,
        files_modified: summary.files_modified,
        summary_text: summary.summary_text,
      });
    }

    // 更新全局元数据
    await this.storage.updateGlobalMetadata(summary);
  }

  /**
   * 获取活跃会话状态
   */
  getActiveSessionsStatus(): { sessionId: string; duration: number; tools: number }[] {
    const now = Date.now();
    return Array.from(this.activeSessions.entries()).map(([sessionId, session]) => ({
      sessionId,
      duration: Math.round((now - session.start_time) / 1000),
      tools: session.tool_events.length,
    }));
  }

  /**
   * 获取活跃会话摘要列表
   */
  getActiveSessionsSummary(): SessionSummary[] {
    return Array.from(this.activeSessions.values()).map(session => this.buildActiveSummary(session));
  }

  /**
   * 获取活跃会话详情
   */
  getActiveSessionById(sessionId: string): SessionSummary | null {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return null;
    }
    return this.buildActiveSummary(session);
  }
}

// 内部类型定义
interface ActiveSession {
  session_id: string;
  start_time: number;
  start_data: any;
  tool_events: ToolEvent[];
  files_modified: Set<string>;
}

interface ToolEvent {
  tool_name: string;
  success: boolean;
  timestamp: number;
  tool_input?: any;
}
