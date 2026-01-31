import { EventEmitter } from "events";
import type {
  AgentInfo,
  AgentStatus,
  AgentType,
  AgentQueryOptions,
  AgentRegistryEvent,
} from "./types/agent-types";

/**
 * Agent心跳超时时间（毫秒）
 * 默认5分钟无心跳则认为Agent失联
 */
export const AGENT_TIMEOUT = 5 * 60 * 1000;

/**
 * Agent注册表
 *
 * 管理所有Agent的注册、状态更新、查询和注销
 */
export class AgentRegistry extends EventEmitter {
  private agents: Map<string, AgentInfo> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    // 启动定时清理任务
    this.startCleanupTask();
  }

  /**
   * 注册新Agent
   */
  register(config: {
    sessionId: string;
    type: AgentType;
    label: string;
    agentConfig: string;
    workingDir: string;
    parentId?: string;
    metadata?: Record<string, any>;
  }): AgentInfo {
    const now = Date.now();

    const agentInfo: AgentInfo = {
      sessionId: config.sessionId,
      type: config.type,
      label: config.label,
      status: "idle",
      agentConfig: config.agentConfig,
      workingDir: config.workingDir,
      parentId: config.parentId,
      createdAt: now,
      lastHeartbeat: now,
      metadata: config.metadata,
    };

    this.agents.set(config.sessionId, agentInfo);

    this.emit("event", {
      type: "registered",
      agent: agentInfo,
      timestamp: now,
    } as AgentRegistryEvent);

    return agentInfo;
  }

  /**
   * 获取Agent信息
   */
  get(sessionId: string): AgentInfo | undefined {
    return this.agents.get(sessionId);
  }

  /**
   * 更新Agent状态
   */
  updateStatus(sessionId: string, status: AgentStatus): AgentInfo | undefined {
    const agent = this.agents.get(sessionId);
    if (!agent) {
      return undefined;
    }

    agent.status = status;
    agent.lastHeartbeat = Date.now();

    this.emit("event", {
      type: "updated",
      agent: { ...agent },
      timestamp: agent.lastHeartbeat,
    } as AgentRegistryEvent);

    return agent;
  }

  /**
   * 更新Agent心跳
   */
  heartbeat(sessionId: string): AgentInfo | undefined {
    const agent = this.agents.get(sessionId);
    if (!agent) {
      return undefined;
    }

    const now = Date.now();
    agent.lastHeartbeat = now;

    this.emit("event", {
      type: "heartbeat",
      agent: { ...agent },
      timestamp: now,
    } as AgentRegistryEvent);

    return agent;
  }

  /**
   * 注销Agent
   */
  unregister(sessionId: string): boolean {
    const agent = this.agents.get(sessionId);
    if (!agent) {
      return false;
    }

    this.agents.delete(sessionId);

    this.emit("event", {
      type: "unregistered",
      agent,
      timestamp: Date.now(),
    } as AgentRegistryEvent);

    return true;
  }

  /**
   * 查询Agent列表
   */
  query(options: AgentQueryOptions = {}): AgentInfo[] {
    let results = Array.from(this.agents.values());

    if (options.type) {
      results = results.filter(a => a.type === options.type);
    }

    if (options.status) {
      results = results.filter(a => a.status === options.status);
    }

    if (options.parentId) {
      results = results.filter(a => a.parentId === options.parentId);
    }

    if (options.agentConfig) {
      results = results.filter(a => a.agentConfig === options.agentConfig);
    }

    return results;
  }

  /**
   * 获取所有Agent
   */
  getAll(): AgentInfo[] {
    return Array.from(this.agents.values());
  }

  /**
   * 启动定时清理任务
   */
  private startCleanupTask(): void {
    // 每分钟检查一次
    this.cleanupInterval = setInterval(() => {
      this.cleanupTimedOutAgents();
    }, 60 * 1000);
  }

  /**
   * 清理超时的Agent
   * 将超时Agent标记为disconnected状态
   */
  cleanupTimedOutAgents(): void {
    const now = Date.now();
    const timeout = AGENT_TIMEOUT;

    for (const [sessionId, agent] of this.agents.entries()) {
      if (now - agent.lastHeartbeat > timeout && agent.status !== "disconnected") {
        agent.status = "disconnected";

        this.emit("event", {
          type: "updated",
          agent: { ...agent },
          timestamp: now,
        } as AgentRegistryEvent);
      }
    }
  }

  /**
   * 销毁注册表
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.agents.clear();
    this.removeAllListeners();
  }
}
