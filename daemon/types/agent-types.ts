/**
 * agent-types.ts
 *
 * Agent协作网络的核心类型定义
 */

/**
 * Agent类型
 */
export type AgentType = 'master' | 'worker';

/**
 * Agent状态
 */
export type AgentStatus = 'idle' | 'busy' | 'error' | 'disconnected';

/**
 * Agent信息
 */
export interface AgentInfo {
  sessionId: string;           // Claude Code会话ID
  type: AgentType;             // Agent类型
  label: string;               // 显示名称
  status: AgentStatus;         // 当前状态
  agentConfig: string;         // 使用的配置包名称
  workingDir: string;          // 工作目录
  parentId?: string;           // 父Agent的sessionId（仅worker）
  createdAt: number;           // 创建时间戳
  lastHeartbeat: number;       // 最后心跳时间戳
  metadata?: Record<string, any>; // 额外元数据
}

/**
 * Agent注册事件
 */
export interface AgentRegistryEvent {
  type: 'registered' | 'updated' | 'unregistered' | 'heartbeat';
  agent: AgentInfo;
  timestamp: number;
}

/**
 * Agent查询选项
 */
export interface AgentQueryOptions {
  type?: AgentType;
  status?: AgentStatus;
  parentId?: string;
  agentConfig?: string;
}
