import { mkdirSync, writeFileSync, readFileSync, unlinkSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { EventEmitter } from "events";

import type {
  AgentMessage,
  MessageTarget,
  MessageType,
  MessageStatus,
  MessageQueryOptions,
  TaskCompletionReport,
} from "./types/message-types";

/**
 * 消息代理
 *
 * 管理Agent间的消息路由、队列和持久化
 */
export class MessageBroker extends EventEmitter {
  private messages: Map<string, AgentMessage> = new Map();
  private inbox: Map<string, Set<string>> = new Map(); // sessionId -> messageIds
  private storageDir: string;
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  constructor(storageDir: string = `${process.env.HOME || "."}/.claude/AGENT_MESSAGES`) {
    super();
    this.storageDir = storageDir;
    this.ensureStorageDir();
    this.loadPersistedMessages();
    this.startFlushTask();
  }

  /**
   * 确保存储目录存在
   */
  private ensureStorageDir(): void {
    mkdirSync(this.storageDir, { recursive: true });
  }

  /**
   * 生成消息ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  /**
   * 发送消息
   */
  send(params: {
    from: string;
    to: MessageTarget;
    type: MessageType;
    content: string;
    metadata?: Record<string, any>;
    replyTo?: string;
  }): AgentMessage {
    const now = Date.now();
    const messageId = this.generateMessageId();

    const message: AgentMessage = {
      id: messageId,
      type: params.type,
      from: params.from,
      to: params.to,
      timestamp: now,
      content: params.content,
      status: "pending",
      metadata: params.metadata,
      replyTo: params.replyTo,
    };

    this.messages.set(messageId, message);

    // 添加到接收者收件箱
    this.addToInbox(message);

    // 持久化
    this.persistMessage(message);

    // 触发事件
    this.emit("message", message);

    return message;
  }

  /**
   * 添加消息到收件箱
   */
  private addToInbox(message: AgentMessage): void {
    const targets = this.resolveTargets(message.to);

    for (const target of targets) {
      if (!this.inbox.has(target)) {
        this.inbox.set(target, new Set());
      }
      this.inbox.get(target)!.add(message.id);
    }
  }

  /**
   * 解析消息目标
   */
  private resolveTargets(to: MessageTarget): string[] {
    if (to === "broadcast") {
      // 返回所有已知的sessionId（这里需要从AgentRegistry获取，暂时返回空）
      return [];
    }

    // 直接返回目标sessionId
    return [to];
  }

  /**
   * 获取Agent的消息
   */
  getMessages(sessionId: string): AgentMessage[] {
    const messageIds = this.inbox.get(sessionId);
    if (!messageIds) {
      return [];
    }

    const messages: AgentMessage[] = [];
    for (const id of messageIds) {
      const message = this.messages.get(id);
      if (message) {
        messages.push(message);
      }
    }

    return messages.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * 获取未读消息
   */
  getUnreadMessages(sessionId: string): AgentMessage[] {
    return this.getMessages(sessionId).filter(m => m.status === "pending");
  }

  /**
   * 获取单条消息
   */
  getMessage(messageId: string): AgentMessage | undefined {
    return this.messages.get(messageId);
  }

  /**
   * 标记消息为已读
   */
  markAsRead(messageId: string): boolean {
    const message = this.messages.get(messageId);
    if (!message) {
      return false;
    }

    message.status = "read";
    this.persistMessage(message);
    return true;
  }

  /**
   * 标记消息为已送达
   */
  markAsDelivered(messageId: string): boolean {
    const message = this.messages.get(messageId);
    if (!message) {
      return false;
    }

    message.status = "delivered";
    this.persistMessage(message);
    return true;
  }

  /**
   * 查询消息
   */
  query(options: MessageQueryOptions = {}): AgentMessage[] {
    let results = Array.from(this.messages.values());

    if (options.sessionId) {
      results = results.filter(m => {
        const ids = this.inbox.get(options.sessionId!);
        return ids?.has(m.id);
      });
    }

    if (options.type) {
      results = results.filter(m => m.type === options.type);
    }

    if (options.status) {
      results = results.filter(m => m.status === options.status);
    }

    if (options.from) {
      results = results.filter(m => m.from === options.from);
    }

    if (options.to) {
      results = results.filter(m => m.to === options.to);
    }

    if (options.since) {
      results = results.filter(m => m.timestamp >= options.since!);
    }

    // 按时间戳排序
    results.sort((a, b) => a.timestamp - b.timestamp);

    // 限制数量
    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * 删除消息
   */
  deleteMessage(messageId: string): boolean {
    const message = this.messages.get(messageId);
    if (!message) {
      return false;
    }

    // 从收件箱移除
    for (const [, ids] of this.inbox.entries()) {
      ids.delete(messageId);
    }

    this.messages.delete(messageId);

    // 删除持久化文件
    const filePath = join(this.storageDir, `${messageId}.json`);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }

    return true;
  }

  /**
   * 删除旧消息
   */
  deleteOldMessages(beforeTimestamp: number): number {
    let count = 0;

    for (const [id, message] of this.messages.entries()) {
      if (message.timestamp < beforeTimestamp) {
        this.deleteMessage(id);
        count++;
      }
    }

    return count;
  }

  /**
   * 持久化消息到文件
   */
  private persistMessage(message: AgentMessage): void {
    const filePath = join(this.storageDir, `${message.id}.json`);
    writeFileSync(filePath, JSON.stringify(message, null, 2));
  }

  /**
   * 从文件加载持久化的消息
   */
  private loadPersistedMessages(): void {
    if (!existsSync(this.storageDir)) {
      return;
    }

    const files = readdirSync(this.storageDir);
    const messageFiles = files.filter(f => f.endsWith(".json"));

    for (const file of messageFiles) {
      try {
        const filePath = join(this.storageDir, file);
        const content = readFileSync(filePath, "utf-8");
        const message: AgentMessage = JSON.parse(content);

        this.messages.set(message.id, message);
        this.addToInbox(message);
      } catch (e) {
        console.error(`Failed to load message from ${file}:`, e);
      }
    }
  }

  /**
   * 启动定期清理任务
   */
  private startFlushTask(): void {
    // 每小时清理一次超过24小时的消息
    this.flushInterval = setInterval(() => {
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      this.deleteOldMessages(cutoff);
    }, 60 * 60 * 1000);
  }

  /**
   * 清理特定Agent的消息
   */
  clearMessagesFor(sessionId: string): number {
    const messageIds = this.inbox.get(sessionId);
    if (!messageIds) {
      return 0;
    }

    let count = 0;
    for (const id of messageIds) {
      if (this.deleteMessage(id)) {
        count++;
      }
    }

    this.inbox.delete(sessionId);
    return count;
  }

  /**
   * 销毁消息代理
   */
  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    this.messages.clear();
    this.inbox.clear();
    this.removeAllListeners();
  }
}
