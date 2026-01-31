# Claude Daemon + OpenAI Proxy 整合架构设计

## 文档信息

- **创建日期**: 2026-01-25
- **项目**: claude-daemon + claude-openai-proxy 整合
- **目标**: 复用 claude-daemon 基础设施，构建协议转换代理

---

## 1. 整合方案概述

### 1.1 核心思想

**claude-daemon 作为基础设施层，claude-openai-proxy 作为应用层服务**

```
┌─────────────────────────────────────────────────────────────┐
│                    应用层 (Application Layer)                │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │      claude-openai-proxy (HTTP Service)            │    │
│  │  - OpenAI 协议适配                                  │    │
│  │  - SSE 流式响应                                     │    │
│  │  - 请求路由                                         │    │
│  └────────────────┬───────────────────────────────────┘    │
│                   │ 通过 Daemon API                         │
└───────────────────┼─────────────────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────────────────┐
│              基础设施层 (Infrastructure Layer)               │
│                   claude-daemon (扩展)                       │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Process Manager (新增)                            │    │
│  │  - Claude Code 进程池管理                          │    │
│  │  - stdin/stdout 通信                               │    │
│  │  - 进程生命周期监控                                │    │
│  └────────────────┬───────────────────────────────────┘    │
│                   │                                         │
│  ┌────────────────▼───────────────────────────────────┐    │
│  │  Session Manager (扩展现有)                        │    │
│  │  - 会话映射表                                       │    │
│  │  - 超时清理                                         │    │
│  │  - 状态追踪                                         │    │
│  └────────────────┬───────────────────────────────────┘    │
│                   │                                         │
│  ┌────────────────▼───────────────────────────────────┐    │
│  │  IPC Server (复用现有)                             │    │
│  │  - Unix Socket 通信                                │    │
│  │  - 事件队列                                         │    │
│  │  - 并发控制                                         │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Storage Service (复用现有)                        │    │
│  │  - 会话记录                                         │    │
│  │  - 对话历史                                         │    │
│  │  - 性能指标                                         │    │
│  └────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 整合优势

1. **复用成熟基础设施**
   - ✅ 守护进程架构（systemd/launchd）
   - ✅ Unix Socket IPC（高性能）
   - ✅ 事件队列（并发安全）
   - ✅ 日志系统（结构化日志）
   - ✅ 健康监控（自动恢复）

2. **职责分离**
   - claude-daemon: 基础设施（进程管理、IPC、存储）
   - claude-openai-proxy: 业务逻辑（协议转换、HTTP 服务）

3. **统一管理**
   - 一个守护进程管理所有服务
   - 统一的配置和日志
   - 统一的监控和告警

---

## 2. 详细架构设计

### 2.1 claude-daemon 扩展

#### 新增模块：Process Manager

**职责**: 管理 Claude Code 进程池

**文件**: `daemon/process-manager.ts`

```typescript
// 伪代码示例
class ProcessManager {
  private processes: Map<string, ClaudeProcess>
  private processPool: ClaudeProcess[]

  // 创建新进程
  async createProcess(sessionId: string, config: ProcessConfig): Promise<ClaudeProcess>

  // 获取现有进程
  getProcess(sessionId: string): ClaudeProcess | null

  // 销毁进程
  async destroyProcess(sessionId: string): Promise<void>

  // 进程池预热
  async warmupPool(size: number): Promise<void>

  // 健康检查
  async healthCheck(): Promise<ProcessHealth[]>
}

class ClaudeProcess {
  sessionId: string
  process: ChildProcess
  status: 'starting' | 'ready' | 'busy' | 'error'
  stdin: WritableStream
  stdout: ReadableStream

  // 发送消息
  async sendMessage(message: string): Promise<void>

  // 监听输出
  onOutput(callback: (chunk: string) => void): void

  // 终止进程
  async terminate(): Promise<void>
}
```

**关键功能**:
- 进程启动和关闭
- stdin/stdout 通信
- 输出解析（ANSI 清除、提示符检测）
- 进程池管理（预热、复用）
- 健康监控和自动重启

#### 扩展模块：Session Manager

**现有能力**: 记录和分析会话
**新增能力**: 管理实时会话状态

**文件**: `daemon/session-manager.ts` (扩展)

```typescript
// 扩展现有 SessionManager
class SessionManager {
  // 现有功能
  private sessions: Map<string, SessionRecord>  // 历史记录

  // 新增功能
  private activeSessions: Map<string, ActiveSession>  // 实时会话

  // 创建实时会话
  async createActiveSession(sessionId: string, config: SessionConfig): Promise<ActiveSession>

  // 获取实时会话
  getActiveSession(sessionId: string): ActiveSession | null

  // 关闭实时会话
  async closeActiveSession(sessionId: string): Promise<void>

  // 超时清理（复用现有的 cleanup-service）
  async cleanupInactiveSessions(): Promise<void>
}

interface ActiveSession {
  sessionId: string
  processId: string  // 关联的 Claude Code 进程
  status: 'active' | 'idle' | 'closed'
  createdAt: number
  lastActiveAt: number
  messageCount: number
  systemMessage?: string
}
```

**整合点**:
- 复用现有的会话记录功能
- 扩展支持实时会话管理
- 统一的超时清理机制

---

### 2.2 IPC 协议设计

#### 新增 IPC 命令

**文件**: `daemon/ipc-protocol.ts` (新增)

claude-openai-proxy 通过 Unix Socket 与 claude-daemon 通信：

```typescript
// 命令类型
type IPCCommand =
  | 'process.create'      // 创建进程
  | 'process.get'         // 获取进程
  | 'process.destroy'     // 销毁进程
  | 'process.send'        // 发送消息
  | 'process.health'      // 健康检查
  | 'session.create'      // 创建会话
  | 'session.get'         // 获取会话
  | 'session.close'       // 关闭会话

// 请求格式
interface IPCRequest {
  command: IPCCommand
  sessionId: string
  data?: any
}

// 响应格式
interface IPCResponse {
  success: boolean
  data?: any
  error?: string
}

// 流式输出事件
interface StreamEvent {
  type: 'chunk' | 'end' | 'error'
  sessionId: string
  data?: string
  error?: string
}
```

**示例交互**:

```javascript
// 1. 创建进程
→ { command: 'process.create', sessionId: 'room123-user456', data: { systemMessage: '你是小小狗' } }
← { success: true, data: { processId: 'proc-abc', status: 'ready' } }

// 2. 发送消息
→ { command: 'process.send', sessionId: 'room123-user456', data: { message: '你好' } }
← { success: true }

// 3. 接收流式输出（通过事件）
← { type: 'chunk', sessionId: 'room123-user456', data: '你好' }
← { type: 'chunk', sessionId: 'room123-user456', data: '！' }
← { type: 'end', sessionId: 'room123-user456' }
```

---

### 2.3 claude-openai-proxy 实现

#### 架构

claude-openai-proxy 作为独立的 HTTP 服务，通过 IPC 与 claude-daemon 通信。

**项目结构**:

```
claude-openai-proxy/
├── src/
│   ├── server.ts              # HTTP 服务器
│   ├── daemon-client.ts       # Daemon IPC 客户端
│   ├── protocol-adapter.ts    # OpenAI 协议适配
│   └── stream-handler.ts      # SSE 流式处理
├── package.json
└── README.md
```

#### 核心模块

**1. Daemon Client**

**文件**: `src/daemon-client.ts`

```typescript
class DaemonClient {
  private socket: net.Socket

  // 连接到 daemon
  async connect(): Promise<void>

  // 发送命令
  async sendCommand(request: IPCRequest): Promise<IPCResponse>

  // 监听流式输出
  onStreamEvent(callback: (event: StreamEvent) => void): void

  // 创建会话
  async createSession(sessionId: string, systemMessage: string): Promise<void>

  // 发送消息
  async sendMessage(sessionId: string, message: string): Promise<void>

  // 关闭会话
  async closeSession(sessionId: string): Promise<void>
}
```

**2. HTTP Server**

**文件**: `src/server.ts`

```typescript
app.post('/api/v3/chat/completions', async (req, res) => {
  const { messages, stream = true } = req.body

  // 提取 sessionId
  const sessionId = extractSessionId(req)

  // 提取 system message 和用户消息
  const systemMessage = messages.find(m => m.role === 'system')?.content
  const userMessage = messages[messages.length - 1].content

  // 通过 daemon client 创建或获取会话
  await daemonClient.createSession(sessionId, systemMessage)

  // 设置 SSE 响应
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')

  // 监听流式输出
  daemonClient.onStreamEvent((event) => {
    if (event.sessionId !== sessionId) return

    if (event.type === 'chunk') {
      // 转换为 OpenAI SSE 格式
      const sseData = formatOpenAIChunk(event.data)
      res.write(`data: ${JSON.stringify(sseData)}\n\n`)
    } else if (event.type === 'end') {
      res.write('data: [DONE]\n\n')
      res.end()
    }
  })

  // 发送消息到 daemon
  await daemonClient.sendMessage(sessionId, userMessage)
})
```

---

## 3. 完整通信流程

### 3.1 首次对话流程

```
1. 火山引擎 AIGC 服务
   ↓
   POST /api/v3/chat/completions

2. claude-openai-proxy (HTTP Server)
   ↓
   提取 sessionId, systemMessage, userMessage

3. 通过 Unix Socket 发送到 claude-daemon
   ↓
   { command: 'session.create', sessionId: 'xxx', data: { systemMessage } }

4. claude-daemon (Process Manager)
   ↓
   - 检查是否已有进程
   - 如果没有，启动新的 Claude Code 进程
   - 等待进程就绪

5. claude-daemon 响应
   ↓
   { success: true, data: { status: 'ready' } }

6. claude-openai-proxy 发送用户消息
   ↓
   { command: 'process.send', sessionId: 'xxx', data: { message: '你好' } }

7. claude-daemon 写入 Claude Code stdin
   ↓
   stdin.write('你好\n')

8. Claude Code 响应
   ↓
   stdout: "你好！我是小小狗..."

9. claude-daemon 解析输出并推送事件
   ↓
   { type: 'chunk', sessionId: 'xxx', data: '你好' }
   { type: 'chunk', sessionId: 'xxx', data: '！' }
   ...
   { type: 'end', sessionId: 'xxx' }

10. claude-openai-proxy 转换为 SSE
    ↓
    data: {"choices":[{"delta":{"content":"你好"}}]}
    data: {"choices":[{"delta":{"content":"！"}}]}
    data: [DONE]

11. 返回给火山引擎
```

---

## 4. 部署方案

### 4.1 目录结构

```
~/.claude/
├── daemon/                    # claude-daemon (扩展)
│   ├── main.ts
│   ├── process-manager.ts    # 新增
│   ├── ipc-protocol.ts       # 新增
│   └── ...
├── hooks-push/               # 现有 hooks
├── SESSIONS/                 # 会话数据
└── daemon.log               # 日志

/opt/claude-openai-proxy/    # 独立部署
├── src/
│   ├── server.ts
│   ├── daemon-client.ts
│   └── ...
├── package.json
└── proxy.log
```

### 4.2 启动顺序

```bash
# 1. 启动 claude-daemon（扩展版）
claude-daemon start

# 2. 启动 claude-openai-proxy
cd /opt/claude-openai-proxy
npm start

# 3. 验证
curl http://localhost:3002/health
```

### 4.3 systemd 服务配置

**claude-daemon.service** (扩展现有)

```ini
[Unit]
Description=Claude Daemon with Process Manager
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/bun ~/.claude/daemon/main.ts
Restart=always
User=%i

[Install]
WantedBy=multi-user.target
```

**claude-openai-proxy.service** (新增)

```ini
[Unit]
Description=Claude OpenAI Proxy
After=claude-daemon.service
Requires=claude-daemon.service

[Service]
Type=simple
WorkingDirectory=/opt/claude-openai-proxy
ExecStart=/usr/bin/node src/server.js
Restart=always
Environment="PORT=3002"

[Install]
WantedBy=multi-user.target
```

---

## 5. 整合优势总结

### 5.1 复用现有能力

| 能力 | claude-daemon 提供 | claude-openai-proxy 复用 |
|------|-------------------|------------------------|
| 守护进程架构 | ✅ systemd/launchd | ✅ 依赖 daemon 服务 |
| Unix Socket IPC | ✅ 高性能通信 | ✅ 通过 Socket 通信 |
| 事件队列 | ✅ 并发安全 | ✅ 复用队列机制 |
| 日志系统 | ✅ 结构化日志 | ✅ 统一日志格式 |
| 健康监控 | ✅ 自动恢复 | ✅ 进程健康检查 |
| 会话记录 | ✅ JSONL 存储 | ✅ 自动记录对话 |

### 5.2 架构优势

1. **职责分离**
   - claude-daemon: 基础设施层（进程管理、IPC、存储）
   - claude-openai-proxy: 应用层（协议转换、HTTP 服务）

2. **统一管理**
   - 一个守护进程管理所有 Claude Code 进程
   - 统一的配置、日志、监控
   - 简化运维复杂度

3. **性能优化**
   - Unix Socket 比 HTTP 更快
   - 进程池预热减少启动延迟
   - 事件队列保证并发安全

4. **可扩展性**
   - 易于添加新的服务模块
   - 可以支持多种协议（OpenAI、Anthropic、自定义）
   - 便于水平扩展

---

## 6. 实施步骤

### 6.1 第一阶段：扩展 claude-daemon（3-5 天）

**目标**: 在 claude-daemon 中添加进程管理能力

**任务**:
1. 实现 Process Manager 模块
   - Claude Code 进程启动和管理
   - stdin/stdout 通信
   - 输出解析（ANSI 清除、提示符检测）

2. 扩展 IPC 协议
   - 定义新的命令类型
   - 实现流式输出事件推送

3. 扩展 Session Manager
   - 添加实时会话管理
   - 关联进程和会话

4. 单元测试
   - Process Manager 测试
   - IPC 协议测试

**交付物**:
- 扩展版 claude-daemon
- 单元测试覆盖

### 6.2 第二阶段：开发 claude-openai-proxy（2-3 天）

**目标**: 实现 HTTP 服务和协议转换

**任务**:
1. 实现 Daemon Client
   - Unix Socket 连接
   - IPC 命令发送
   - 流式事件监听

2. 实现 HTTP Server
   - OpenAI API 接口
   - SSE 流式响应
   - 错误处理

3. 协议适配
   - OpenAI 格式解析
   - SSE 格式转换

**交付物**:
- claude-openai-proxy 服务
- API 文档

### 6.3 第三阶段：集成测试（2-3 天）

**目标**: 完整集成并测试

**任务**:
1. 端到端测试
   - 修改火山引擎配置
   - 启动完整服务链
   - 测试实时对话流程

2. 性能测试
   - 并发会话测试
   - 延迟测试
   - 资源使用监控

3. 文档完善
   - 部署文档
   - 运维手册
   - 故障排查指南

**交付物**:
- 集成测试报告
- 完整文档

---

## 7. 总结

### 7.1 整合方案核心价值

1. **复用成熟基础设施**
   - claude-daemon 已有完整的守护进程架构
   - 无需重复开发 IPC、事件队列、日志等基础设施
   - 开发周期缩短 50%

2. **统一的 Claude Code 管理**
   - 所有 Claude Code 相关服务统一管理
   - 会话记录、进程管理、协议转换在同一体系
   - 便于监控和运维

3. **清晰的职责分离**
   - claude-daemon: 基础设施层
   - claude-openai-proxy: 应用层
   - 易于测试、维护和扩展

### 7.2 与独立方案的对比

| 维度 | 独立 claude-openai-proxy | 整合方案 |
|------|------------------------|---------|
| 开发工作量 | 需要从零实现所有基础设施 | 复用 70% 现有代码 |
| 运维复杂度 | 需要单独管理守护进程 | 统一管理 |
| 性能 | HTTP/TCP 通信 | Unix Socket（更快） |
| 可扩展性 | 独立扩展 | 统一扩展 |
| 会话记录 | 需要单独实现 | 自动记录 |

### 7.3 推荐理由

**强烈推荐使用整合方案**，因为：

1. ✅ **开发效率高** - 复用现有基础设施，快速实现
2. ✅ **架构清晰** - 分层设计，职责明确
3. ✅ **性能更好** - Unix Socket 比 HTTP 快
4. ✅ **运维简单** - 统一管理，降低复杂度
5. ✅ **可扩展性强** - 易于添加新功能

### 7.4 下一步行动

1. **立即开始**: 第一阶段 - 扩展 claude-daemon
2. **并行准备**: 设计 IPC 协议细节
3. **快速迭代**: 2 周内完成 MVP

---

**文档结束**

