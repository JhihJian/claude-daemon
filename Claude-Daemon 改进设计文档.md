# Claude Daemon 设计文档 

## 目录

1. [Web UI API 端点](#1-web-ui-api-端点)
2. [Web UI 页面](#2-web-ui-页面)
3. [WebSocket 事件](#3-websocket-事件)
4. [与现有 Daemon 的集成](#4-与现有-daemon-的集成)
5. [存储与归档](#5-存储与归档)
6. [错误处理与边界情况](#6-错误处理与边界情况)
7. [完整数据流](#7-完整数据流)
8. [实现文件结构](#8-实现文件结构)
9. [迁移与向后兼容性](#9-迁移与向后兼容性)
10. [设计总结](#10-设计总结)

---

## 1. Web UI API 端点

### 代理配置 API

| 方法 | 端点 | 说明 |
|------|------|------|
| `GET` | `/api/agents` | 列出所有代理配置 |
| `GET` | `/api/agents/:name` | 获取指定代理配置 |
| `POST` | `/api/agents/:name/reload` | 从磁盘重新加载代理配置 |

### 会话管理 API

| 方法 | 端点 | 说明 |
|------|------|------|
| `GET` | `/api/sessions/active` | 列出活动会话（来自 SessionRegistry） |
| `GET` | `/api/sessions/active/:id` | 获取活动会话详情 |
| `POST` | `/api/sessions/launch` | 使用代理启动新会话 |
| `POST` | `/api/sessions/:id/terminate` | 终止活动会话 |

### 归档 API

| 方法 | 端点 | 说明 |
|------|------|------|
| `GET` | `/api/sessions/archive?agent=python-dev&limit=50` | 查询归档会话（支持代理过滤） |
| `GET` | `/api/sessions/archive/:id` | 获取归档会话详情 |

---

## 2. Web UI 页面

### 2.1 代理管理页面 (`/agents`)

- 列出所有已配置的代理
- **显示信息**：名称、描述、技能数量、MCP 服务器数量
- **操作**：查看详情、重新加载配置

### 2.2 代理详情页面 (`/agents/:name`)

- 显示完整的 `config.json`
- 渲染 `CLAUDE.md` 内容（Markdown 格式）
- 列出环境变量（仅显示键名，出于安全考虑不显示值）
- 显示使用该代理的会话（活动 + 最近归档）

### 2.3 会话管理页面 (`/sessions`)

- **标签页**：活动 | 归档
- **活动标签**：来自 SessionRegistry 的实时列表
- **归档标签**：历史会话，支持代理过滤
- **显示字段**：session_id、agent_name、working_directory、duration、status

### 2.4 启动会话页面 (`/launch`)

- **下拉菜单**：选择代理
- **输入框**：工作目录（带文件选择器）
- **按钮**：启动会话
- **显示**：已启动会话的详情及会话页面链接

---

## 3. WebSocket 事件

广播给所有连接的客户端：

```typescript
// 会话注册事件
{
  type: "session_registered",
  data: SessionRecord
}

// 会话注销事件
{
  type: "session_unregistered",
  data: { session_id: string }
}

// 代理重新加载事件
{
  type: "agent_reloaded",
  data: { agent_name: string }
}
```

---

## 4. 与现有 Daemon 的集成

### 4.1 Daemon 主要变更

**文件**：`daemon/main.ts`

```typescript
class ClaudeDaemon {
  // 新增服务
  private agentRegistry: AgentDefinitionRegistry;
  private sessionRegistry: SessionRegistry;
  private sessionLauncher: SessionLauncher;

  constructor() {
    // ... 现有服务
    this.agentRegistry = new AgentDefinitionRegistry();
    this.sessionRegistry = new SessionRegistry(this.storage);
    this.sessionLauncher = new SessionLauncher(
      this.agentRegistry,
      this.sessionRegistry,
      this.eventBus
    );
  }

  async start() {
    // ... 现有启动逻辑

    // 加载代理配置
    await this.agentRegistry.initialize();
    logger.info(`✓ 已加载 ${this.agentRegistry.listAgents().length} 个代理配置`);
    
    // [v2 新增] 恢复活动会话状态
    await this.sessionRegistry.initialize();
    logger.info(`✓ 已恢复 ${this.sessionRegistry.getActiveCount()} 个活动会话`);
  }

  private setupQueueHandlers() {
    // ... 现有处理器

    // 新增：处理会话注册
    this.eventQueue.on('session_register', async (event: QueuedEvent) => {
      const data = event.data;
      
      //使用异步方法注册，包含状态持久化
      await this.sessionRegistry.register({
        session_id: data.session_id,
        agent_name: data.agent_name,
        pid: data.pid,
        status: 'active',
        start_time: data.start_time,
        working_directory: data.working_directory,
        git_repo: data.git_repo,
        git_branch: data.git_branch,
        environment: data.environment,
      });

      // 广播到 Web UI
      if (this.webServer) {
        this.webServer.broadcast({
          type: 'session_registered',
          data: this.sessionRegistry.getActive(),
        });
      }

      logger.info('会话已注册', {
        sessionId: data.session_id,
        agent: data.agent_name,
        pid: data.pid,
      });
    });

    // 新增：处理会话注销
    this.eventQueue.on('session_unregister', async (event: QueuedEvent) => {
      const sessionId = event.data.session_id;
      
      //使用异步方法注销，包含状态持久化
      await this.sessionRegistry.unregister(sessionId);

      // 广播到 Web UI
      if (this.webServer) {
        this.webServer.broadcast({
          type: 'session_unregistered',
          data: { session_id: sessionId },
        });
      }

      logger.info('会话已注销', { sessionId });
    });
  }
}
```

### 4.2 SessionRegistry 与 SessionAnalyzer 的共存

新的 `SessionRegistry` 和现有的 `SessionAnalyzer` 服务于不同目的：

| 组件 | 职责 |
|------|------|
| **SessionRegistry** | 跟踪会话使用的代理配置，管理活动/归档生命周期 |
| **SessionAnalyzer** | 分类会话类型（编码/调试/研究），分析工具使用情况 |

两者监听相同的事件但维护独立的状态。一个会话具有：

- **代理名称**（来自 SessionRegistry）— "使用了哪个代理配置"
- **会话类型**（来自 SessionAnalyzer）— "完成了什么类型的工作"

### 4.3 增强的 SessionSummary

```typescript
interface SessionSummary {
  // ... 现有字段
  agent_name: string;  // 新增：代理关联
}
```

当 `SessionAnalyzer.onSessionEnd()` 生成摘要时，它会查询 `SessionRegistry` 获取代理名称并包含在摘要中。

---

## 5. 存储与归档

### 5.1 归档格式

**路径**：`~/.claude/SESSIONS/sessions/archive/YYYY-MM/sessions.jsonl`

```json
{"session_id":"abc","agent_name":"python-dev","pid":12345,"start_time":"2026-02-01T10:00:00Z","end_time":"2026-02-01T10:30:00Z","working_directory":"/projects/backend","git_repo":"my-repo","git_branch":"main","environment":{"CLAUDE_AGENT_CONFIG":"python-dev"}}
{"session_id":"def","agent_name":"default","pid":12346,"start_time":"2026-02-01T11:00:00Z","end_time":"2026-02-01T11:15:00Z","working_directory":"/tmp","git_repo":null,"git_branch":null,"environment":{"CLAUDE_AGENT_CONFIG":"default"}}
```

### 5.2 Storage Service 增强

```typescript
import { appendFile, writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';

class StorageService {
  // [v2 新增] 文件写入锁，防止并发写入冲突
  private writeLocks = new Map<string, Promise<void>>();

  // ... 现有方法

  /**
   * 归档会话记录
   *使用异步 API 和写入锁
   */
  async archiveSession(session: SessionRecord): Promise<void> {
    const yearMonth = new Date(session.start_time).toISOString().slice(0, 7); // YYYY-MM
    const archivePath = join(
      config.getPath('sessionsDir'),
      'sessions',
      'archive',
      yearMonth,
      'sessions.jsonl'
    );

    await this.ensureDirectory(dirname(archivePath));
    
    // [v2 新增] 使用互斥锁确保顺序写入
    await this.writeWithLock(archivePath, JSON.stringify(session) + '\n');
  }

  /**
   * [v2 新增] 带锁的文件追加写入
   */
  private async writeWithLock(filePath: string, content: string): Promise<void> {
    const existingLock = this.writeLocks.get(filePath) ?? Promise.resolve();
    
    const newLock = existingLock.then(async () => {
      await appendFile(filePath, content, { mode: 0o600 });
    }).catch(async (error) => {
      // 如果是文件不存在错误，先创建文件
      if (error.code === 'ENOENT') {
        await this.ensureDirectory(dirname(filePath));
        await writeFile(filePath, content, { mode: 0o600 });
      } else {
        throw error;
      }
    });
    
    this.writeLocks.set(filePath, newLock);
    await newLock;
  }

  /**
   *确保目录存在（异步版本）
   */
  private async ensureDirectory(dirPath: string): Promise<void> {
    if (!existsSync(dirPath)) {
      await mkdir(dirPath, { recursive: true, mode: 0o700 });
    }
  }

  async queryArchive(filters: {
    agentName?: string;
    workingDirectory?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }): Promise<SessionRecord[]> {
    // 读取 JSONL 文件，按条件过滤，返回结果
  }
}
```

### 5.3 活动会话状态持久化

**路径**：`~/.claude/SESSIONS/active-sessions.json`

```typescript
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

class SessionRegistry {
  private activeSessions = new Map<string, SessionRecord>();
  private readonly statePath: string;
  
  // [v2 新增] 操作锁，防止并发修改
  private operationLock = Promise.resolve();

  constructor(private storage: StorageService) {
    this.statePath = join(config.getPath('sessionsDir'), 'active-sessions.json');
  }

  /**
   * [v2 新增] 初始化时恢复持久化的活动会话
   */
  async initialize(): Promise<void> {
    if (!existsSync(this.statePath)) {
      return;
    }

    try {
      const content = await readFile(this.statePath, 'utf-8');
      const savedSessions: SessionRecord[] = JSON.parse(content);
      
      for (const session of savedSessions) {
        // 验证进程是否仍在运行
        if (this.isProcessAlive(session.pid)) {
          this.activeSessions.set(session.session_id, session);
          logger.info('恢复活动会话', { 
            sessionId: session.session_id, 
            pid: session.pid 
          });
        } else {
          // 进程已不存在，归档该会话
          logger.warn('会话进程已终止，归档', { 
            sessionId: session.session_id, 
            pid: session.pid 
          });
          session.status = 'crashed';
          session.end_time = new Date().toISOString();
          await this.storage.archiveSession(session);
        }
      }
      
      // 保存清理后的状态
      await this.persistState();
    } catch (error) {
      logger.error('恢复活动会话失败', error);
    }
  }

  /**
   *注册会话（带锁和持久化）
   */
  async register(session: SessionRecord): Promise<void> {
    await this.withLock(async () => {
      this.activeSessions.set(session.session_id, session);
      await this.persistState();
    });
  }

  /**
   *注销会话（带锁和持久化）
   */
  async unregister(sessionId: string): Promise<SessionRecord | null> {
    return await this.withLock(async () => {
      const session = this.activeSessions.get(sessionId);
      
      if (!session) {
        logger.warn('注销未知会话（可能是重启前的会话）', { sessionId });
        return null;
      }
      
      this.activeSessions.delete(sessionId);
      
      // 归档会话
      session.end_time = new Date().toISOString();
      session.status = 'terminated';
      await this.storage.archiveSession(session);
      
      // 持久化更新后的状态
      await this.persistState();
      
      return session;
    });
  }

  /**
   * [v2 新增] 检查进程是否存活
   */
  private isProcessAlive(pid: number): boolean {
    try {
      // 发送信号 0 检查进程是否存在
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * [v2 新增] 持久化活动会话状态
   */
  private async persistState(): Promise<void> {
    const sessions = Array.from(this.activeSessions.values());
    await writeFile(
      this.statePath, 
      JSON.stringify(sessions, null, 2), 
      { mode: 0o600 }
    );
  }

  /**
   * [v2 新增] 操作锁包装器，确保串行执行
   */
  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const previousLock = this.operationLock;
    let resolve: () => void;
    
    this.operationLock = new Promise<void>((r) => { resolve = r; });
    
    try {
      await previousLock;
      return await operation();
    } finally {
      resolve!();
    }
  }

  get(sessionId: string): SessionRecord | undefined {
    return this.activeSessions.get(sessionId);
  }

  getActive(): SessionRecord[] {
    return Array.from(this.activeSessions.values());
  }

  getActiveCount(): number {
    return this.activeSessions.size;
  }
}
```

---

## 6. 错误处理与边界情况

### 6.1 代理配置错误

```typescript
// 缺失 config.json
if (!existsSync(configPath)) {
  logger.warn(`代理配置缺失: ${agentName}, 跳过`);
  continue;
}

// 无效 JSON
try {
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));
} catch (error) {
  logger.error(`代理配置 JSON 无效: ${agentName}`, error);
  continue;
}

// 缺少必需字段
if (!config.name || !config.description) {
  logger.error(`代理配置不完整: ${agentName}`);
  continue;
}
```

### 6.2 会话启动失败

```typescript
interface LaunchResult {
  success: boolean;
  session_id?: string;
  pid?: number;
  error?: string;
  warning?: string;
}

class SessionLauncher {
  private readonly REGISTRATION_TIMEOUT = 5000; // 5秒

  /**
   *使用 Promise 正确处理异步启动流程
   */
  async launchSession(
    agentName: string, 
    workingDirectory: string
  ): Promise<LaunchResult> {
    // 验证代理是否存在
    const agent = this.agentRegistry.get(agentName);
    if (!agent) {
      return { success: false, error: '代理未找到' };
    }

    // 验证工作目录
    if (!existsSync(workingDirectory)) {
      return { success: false, error: '工作目录未找到' };
    }

    // 准备环境变量
    const env = {
      ...process.env,
      ...agent.environment,
      CLAUDE_AGENT_CONFIG: agentName,
    };

    return new Promise<LaunchResult>((resolve) => {
      const child = spawn('claude', ['--dangerously-skip-permissions'], {
        cwd: workingDirectory,
        env,
        detached: true,
        stdio: 'ignore',
      });

      let resolved = false;

      //正确处理启动错误
      child.on('error', (error) => {
        if (!resolved) {
          resolved = true;
          logger.error('启动 Claude CLI 失败', error);
          resolve({ 
            success: false, 
            error: `启动失败: ${error.message}` 
          });
        }
      });

      // 进程成功启动
      child.on('spawn', () => {
        const pid = child.pid!;
        
        // 分离子进程，使其独立运行
        child.unref();

        // 等待会话注册事件
        const sessionId = this.waitForRegistration(pid);
        
        sessionId
          .then((id) => {
            if (!resolved) {
              resolved = true;
              resolve({
                success: true,
                session_id: id,
                pid,
              });
            }
          })
          .catch(() => {
            if (!resolved) {
              resolved = true;
              resolve({
                success: true,
                pid,
                warning: '会话已启动但注册未确认',
              });
            }
          });
      });

      //进程异常退出
      child.on('exit', (code, signal) => {
        if (!resolved) {
          resolved = true;
          resolve({
            success: false,
            error: `进程退出: code=${code}, signal=${signal}`,
          });
        }
      });
    });
  }

  /**
   * [v2 新增] 等待会话注册事件
   */
  private waitForRegistration(pid: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.eventBus.off('session_registered', handler);
        reject(new Error('注册超时'));
      }, this.REGISTRATION_TIMEOUT);

      const handler = (session: SessionRecord) => {
        if (session.pid === pid) {
          clearTimeout(timeout);
          this.eventBus.off('session_registered', handler);
          resolve(session.session_id);
        }
      };

      this.eventBus.on('session_registered', handler);
    });
  }
}
```

### 6.3 Daemon 重启行为

```typescript
// Daemon 重启时的行为：
// 1. SessionRegistry.initialize() 从 active-sessions.json 恢复状态
// 2. 验证每个会话的进程是否仍在运行
// 3. 存活的会话恢复到 activeSessions Map
// 4. 已终止的会话标记为 'crashed' 并归档
// 5. AgentDefinitionRegistry 从磁盘重新加载

// 会话注销处理现在可以正确处理恢复的会话
this.eventQueue.on('session_unregister', async (event) => {
  const session = await this.sessionRegistry.unregister(event.data.session_id);
  
  if (session) {
    logger.info('会话已注销并归档', { 
      sessionId: event.data.session_id,
      duration: this.calculateDuration(session)
    });
  }
  // 未知会话的警告已在 unregister 方法中记录
});
```

### 6.4 环境变量安全

```typescript
// .env 文件必须具有 0600 权限
const stats = statSync(envPath);
if ((stats.mode & 0o777) !== 0o600) {
  logger.error(`${envPath} 权限不安全，必须为 0600`);
  throw new Error('代理配置不安全');
}

// 永远不要记录环境变量的值
logger.info('已加载代理环境变量', {
  agent: agentName,
  varCount: Object.keys(env).length,
  // 不要: env（会泄露密钥）
});

// Web UI：仅显示环境变量的键名，不显示值
GET /api/agents/:name/environment
→ { keys: ["CLAUDE_AGENT_CONFIG", "DATABASE_URL"], count: 2 }
```

### 6.5 并发安全保证

```typescript
/**
 * 并发安全设计：
 * 
 * 1. SessionRegistry 操作锁
 *    - 所有 register/unregister 操作通过 withLock() 串行化
 *    - 确保状态一致性和持久化原子性
 * 
 * 2. StorageService 文件锁
 *    - 每个文件路径有独立的写入锁
 *    - 同一文件的多次写入按顺序执行
 *    - 不同文件可以并行写入
 * 
 * 3. 事件处理
 *    - EventQueue 本身是顺序处理的
 *    - 每个事件处理完成后才处理下一个
 */
```

---

## 7. 完整数据流

### 7.1 用户通过 Web UI 启动会话

```
1. 用户在 /launch 页面点击"启动"
   → POST /api/sessions/launch { agentName: "python-dev", workingDirectory: "/projects/backend" }

2. SessionLauncher.launchSession()
   → 从 AgentDefinitionRegistry 加载代理配置
   → 读取 .env 文件，与 CLAUDE_AGENT_CONFIG 合并
   → 启动: claude --dangerously-skip-permissions
   → [v2] 返回 Promise，等待 spawn 或 error 事件

3. Claude CLI 启动
   → SessionTracker 钩子在 session_start 时触发
   → 读取 process.env.CLAUDE_AGENT_CONFIG = "python-dev"
   → 向 daemon socket 发送 session_register 事件

4. Daemon 接收 session_register
   → HookServer 发出事件
   → EventQueue 入队
   → [v2] 队列处理器调用 SessionRegistry.register()（带锁）
   → [v2] 持久化到 active-sessions.json
   → WebSocket 广播给所有客户端

5. Web UI 接收 WebSocket 消息
   → 更新活动会话列表
   → 实时显示新会话

6. 用户在 CLI 会话中工作
   → SessionRecorder 捕获事件
   → SessionToolCapture 跟踪工具使用
   → SessionAnalyzer 分类会话类型
   → 所有操作独立于代理跟踪

7. 用户退出 CLI
   → SessionTracker 钩子在 session_end 时触发
   → 发送 session_unregister 事件

8. Daemon 接收 session_unregister
   → [v2] SessionRegistry.unregister()（带锁）
   → [v2] 调用 StorageService.archiveSession()（带文件锁）
   → 写入 ~/.claude/SESSIONS/sessions/archive/2026-02/sessions.jsonl
   → [v2] 更新 active-sessions.json
   → WebSocket 广播移除消息

9. Web UI 更新
   → 从活动列表中移除
   → 会话现可在归档中查询
```

### 7.2 用户手动启动 CLI（无代理配置）

```
1. 用户运行: claude
   → 无 CLAUDE_AGENT_CONFIG 环境变量

2. SessionTracker 钩子触发
   → 读取 process.env.CLAUDE_AGENT_CONFIG = undefined
   → 默认为 "default"
   → 发送 session_register，agent_name: "default"

3. Daemon 正常处理
   → 会话在 "default" 代理下跟踪
   → 所有其他行为相同
```

### 7.3 Daemon 重启恢复流程

```
1. Daemon 启动
   → 加载配置
   → 初始化各服务

2. SessionRegistry.initialize()
   → 读取 ~/.claude/SESSIONS/active-sessions.json
   → 遍历保存的会话记录

3. 对每个保存的会话
   → 调用 process.kill(pid, 0) 检查进程是否存活
   
   3a. 进程存活
       → 恢复到 activeSessions Map
       → 日志: "恢复活动会话"
   
   3b. 进程不存在
       → 标记 status = 'crashed'
       → 设置 end_time
       → 调用 archiveSession() 归档
       → 日志: "会话进程已终止，归档"

4. 持久化清理后的状态
   → 写入 active-sessions.json

5. Daemon 正常运行
   → 恢复的会话在 Web UI 中可见
   → 这些会话结束时正常处理
```

---

## 8. 实现文件结构

### 8.1 新增文件

```
daemon/
├── agent-definition-registry.ts    # 从磁盘加载代理配置
├── session-registry.ts             # [v2] 跟踪活动会话（带持久化和锁）
└── session-launcher.ts             # [v2] 使用 Promise 启动 CLI

hooks-push/
└── SessionTracker.hook.ts          # 注册事件的新钩子

agent-configs/                      # 新目录
└── default/
    ├── CLAUDE.md
    ├── config.json
    └── .env

web/
├── api/
│   ├── agents.ts                   # 代理管理端点
│   └── sessions.ts                 # 增强的会话端点
└── public/
    ├── agents.html                 # 代理列表页面
    ├── agent-detail.html           # 代理详情页面
    ├── sessions.html               # 会话管理页面
    └── launch.html                 # 启动会话页面
```

### 8.2 修改的文件

| 文件 | 变更说明 |
|------|----------|
| `daemon/main.ts` | 添加新服务、事件处理器，[v2] 添加初始化恢复逻辑 |
| `daemon/session-analyzer.ts` | 向 SessionSummary 添加 agent_name |
| `daemon/storage-service.ts` | [v2] 使用异步 API，添加 archiveSession()、queryArchive() |
| `lib/config.ts` | 添加 agentConfigsDir 路径 |
| `web/server.ts` | 添加新 API 路由 |

### 8.3 新增存储文件

| 文件 | 说明 |
|------|------|
| `~/.claude/SESSIONS/active-sessions.json` | 活动会话状态持久化 |
| `~/.claude/SESSIONS/sessions/archive/YYYY-MM/sessions.jsonl` | 归档会话记录 |

---

## 9. 迁移与向后兼容性

### 9.1 现有会话

- 旧会话（此功能之前）没有 `agent_name` 字段
- 查询归档时，将缺失的 `agent_name` 视为 `"default"`
- 无需数据迁移 — 优雅降级

### 9.2 现有钩子

- `SessionRecorder`、`SessionToolCapture`、`SessionAnalyzer` 继续正常工作
- `SessionTracker` 是附加的 — 不干扰现有钩子
- 所有钩子可以共存并独立推送事件

### 9.3 默认代理

- 始终存在于 `agent-configs/default/`
- 最小配置：空技能、无 MCP 服务器、无自定义环境变量
- `CLAUDE.md` 可以为空或包含通用指令
- 确保所有会话都有有效的代理关联

### 9.4 首次升级

- 升级后首次启动，`active-sessions.json` 不存在
- `SessionRegistry.initialize()` 正常跳过恢复
- 之后新创建的会话将被持久化

---

## 10. 设计总结

本设计为 claude-daemon 添加了一个代理配置层：

| 序号 | 功能 |
|------|------|
| 1 | **定义代理**为可重用配置（技能 + MCP + 环境变量），存储在 `agent-configs/` |
| 2 | 通过 `SessionRegistry` **跟踪会话**与代理的关联（[v2] 带持久化和并发控制） |
| 3 | 通过 `SessionLauncher` 从 Web UI **启动会话**（[v2] 正确的异步错误处理） |
| 4 | 通过 `CLAUDE_AGENT_CONFIG` 环境变量**检测代理**（显式、简单） |
| 5 | 提供 **Web UI** 用于代理管理、会话监控和启动 |
| 6 | 与现有 `SessionAnalyzer` **共存**（代理 = 使用的配置，类型 = 完成的工作） |
| 7 | **优雅处理错误**，包含验证、超时和安全检查 |
| 8 | **无需迁移** — 与现有数据向后兼容 |
| 9 | **Daemon 重启恢复** — 活动会话状态持久化 |
| 10 | **并发安全** — 操作锁和文件锁机制 |

该架构是**附加性**的 — 它叠加在现有的事件驱动 daemon 之上，不会破坏当前功能。

