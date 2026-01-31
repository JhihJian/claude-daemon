/**
 * message-types.ts
 *
 * Agent间消息通信的核心类型定义
 */

/**
 * 消息类型
 */
export type MessageType = 'task' | 'progress' | 'result' | 'error' | 'control';

/**
 * 消息状态
 */
export type MessageStatus = 'pending' | 'delivered' | 'read' | 'failed';

/**
 * 消息目标
 */
export type MessageTarget = string | 'broadcast' | 'all-workers' | 'all-masters';

/**
 * Agent消息
 */
export interface AgentMessage {
  id: string;                     // 消息唯一ID
  type: MessageType;              // 消息类型
  from: string;                   // 发送者sessionId
  to: MessageTarget;              // 接收者sessionId或特殊目标
  timestamp: number;              // 发送时间戳
  content: string;                // 消息内容
  status: MessageStatus;          // 当前状态
  metadata?: Record<string, any>; // 额外元数据
  replyTo?: string;               // 回复的消息ID
}

/**
 * 任务完成报告
 */
export interface TaskCompletionReport {
  sessionId: string;              // Agent的sessionId
  taskId: string;                 // 任务ID
  status: 'success' | 'failed' | 'partial';
  result: string;                 // 结果内容
  error?: string;                 // 错误信息
  duration: number;               // 执行时长（毫秒）
  timestamp: number;              // 完成时间戳
}

/**
 * 消息查询选项
 */
export interface MessageQueryOptions {
  sessionId?: string;             // 查询特定会话的消息
  type?: MessageType;             // 按类型过滤
  status?: MessageStatus;         // 按状态过滤
  from?: string;                  // 发送者
  to?: string;                    // 接收者
  limit?: number;                 // 限制返回数量
  since?: number;                 // 起始时间戳
}
