# Claude Daemon - 产品需求文档 (PRD)

**版本:** 1.0  
**日期:** 2025年2月  
**项目定位:** Claude Code CLI 进程管理守护服务

---

## 1. 项目概述

### 1.1 项目定位

Claude Daemon 是一个常驻后台服务，负责管理不同配置的 Claude Code CLI 进程。它提供命令行接口，支持启动、停止、查询 Session，以及向运行中的 Session 注入消息，实现多 Agent 协同工作。

### 1.2 与其他项目的关系

| 项目 | 关系 |
|-----|------|
| SUMM Console | Console 后端通过命令行调用 Daemon 命令管理进程 |
| SUMM Agent | Daemon 启动的 SUMM 主代理使用 SUMM Agent 定义的配置 |

### 1.3 核心能力

1. **进程管理**：启动、停止、查询 Claude Code CLI 进程
2. **配置管理**：管理不同 Agent 的配置（Skills、CLAUDE.md、MCP、环境变量）
3. **消息注入**：向运行中的 Session 注入消息，支持 Agent 间协同
4. **Tracing**：通过 Hook 记录 Session/项目/过程信息

---

## 2. 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Claude Daemon                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │   CLI 接口      │  │   进程管理器     │  │  配置管理   │  │
│  │  - cld start   │  │  - 启动进程      │  │  - Agent    │  │
│  │  - cld stop    │  │  - 停止进程      │  │  - 环境     │  │
│  │  - cld list    │  │  - 状态维护      │  │  - Hook     │  │
│  │  - cld inject  │  │  - IO 转发       │  │             │  │
│  │  - cld attach  │  └────────┬────────┘  └─────────────┘  │
│  └────────┬────────┘           │                            │
│           │                    ▼                            │
│           │         ┌─────────────────────┐                 │
│           │         │   Session 池        │                 │
│           │         │  ┌───┐ ┌───┐ ┌───┐  │                 │
│           │         │  │S1 │ │S2 │ │S3 │  │                 │
│           │         │  └───┘ └───┘ └───┘  │                 │
│           │         └─────────────────────┘                 │
│           │                    │                            │
│  ┌────────▼────────────────────▼────────┐                   │
│  │            Tracing 模块              │                   │
│  │  - Session Hook                      │                   │
│  │  - 过程记录                          │                   │
│  └──────────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │ Claude Code CLI   │
                    │    (多实例)        │
                    └───────────────────┘
```

---

## 3. Agent 配置管理

### 3.1 配置项

每个 Agent 类型包含以下配置：

| 配置项 | 说明 | 示例 |
|-------|------|------|
| name | Agent 类型名称 | `SUMM`, `DEV-AGENT`, `TEST-AGENT` |
| skills | Skill 文件路径列表 | `["/path/to/skill1.md", "/path/to/skill2.md"]` |
| claude_md | CLAUDE.md 文件路径 | `/path/to/CLAUDE.md` |
| mcp_config | MCP 配置文件路径 | `/path/to/mcp.json` |
| env | 环境变量 | 见下表 |

**环境变量配置：**

| 变量名 | 说明 |
|-------|------|
| HTTP_PROXY | HTTP 代理 |
| HTTPS_PROXY | HTTPS 代理 |
| ANTHROPIC_BASE_URL | Anthropic API 地址 |
| ANTHROPIC_AUTH_TOKEN | Anthropic 认证令牌 |

### 3.2 配置文件结构

```
~/.claude-daemon/
├── config.json              # Daemon 全局配置
├── agents/                  # Agent 配置目录
│   ├── SUMM/
│   │   ├── agent.json       # Agent 配置
│   │   ├── CLAUDE.md        # 系统提示词
│   │   ├── skills/          # Skill 文件
│   │   └── mcp.json         # MCP 配置
│   ├── DEV-AGENT/
│   │   └── ...
│   └── TEST-AGENT/
│       └── ...
├── sessions/                # Session 运行时数据
│   ├── session_001/
│   │   ├── meta.json        # Session 元信息
│   │   └── trace/           # Tracing 数据
│   └── session_002/
│       └── ...
└── logs/                    # 日志目录
```

### 3.3 Agent 配置文件格式 (agent.json)

```json
{
  "name": "DEV-AGENT",
  "description": "开发任务执行 Agent",
  "skills": [
    "skills/coding.md",
    "skills/git.md"
  ],
  "claude_md": "CLAUDE.md",
  "mcp_config": "mcp.json",
  "env": {
    "HTTP_PROXY": "http://proxy:8080",
    "ANTHROPIC_BASE_URL": "https://api.anthropic.com",
    "ANTHROPIC_AUTH_TOKEN": "${ANTHROPIC_AUTH_TOKEN}"
  }
}
```

---

## 4. 命令行接口

### 4.1 命令概览

| 命令 | 说明 |
|-----|------|
| `cld start` | 启动新 Session |
| `cld stop` | 停止 Session |
| `cld list` | 列出所有 Session |
| `cld status` | 查询 Session 状态 |
| `cld attach` | 连接到 Session 终端 |
| `cld inject` | 向 Session 注入消息 |
| `cld agent list` | 列出所有 Agent 配置 |
| `cld agent show` | 查看 Agent 配置详情 |
| `cld daemon start` | 启动守护进程 |
| `cld daemon stop` | 停止守护进程 |
| `cld daemon status` | 查看守护进程状态 |

### 4.2 命令详细说明

#### 4.2.1 cld start

启动新的 Claude Code CLI Session。

```bash
cld start --agent <agent-name> --workdir <path> [--name <session-name>]
```

**参数：**

| 参数 | 必填 | 说明 |
|-----|------|------|
| --agent | 是 | Agent 类型名称 |
| --workdir | 是 | 工作目录路径 |
| --name | 否 | 自定义 Session 名称，默认自动生成 |

**输出：**

```json
{
  "session_id": "session_001",
  "name": "DEV-AGENT-001",
  "agent": "DEV-AGENT",
  "workdir": "/path/to/workdir",
  "status": "running",
  "pid": 12345,
  "created_at": "2025-02-01T10:00:00Z"
}
```

#### 4.2.2 cld stop

停止指定 Session。

```bash
cld stop <session-id>
```

**参数：**

| 参数 | 必填 | 说明 |
|-----|------|------|
| session-id | 是 | Session ID 或名称 |

**输出：**

```json
{
  "session_id": "session_001",
  "status": "stopped"
}
```

#### 4.2.3 cld list

列出所有 Session。

```bash
cld list [--status <status>] [--agent <agent-name>]
```

**参数：**

| 参数 | 必填 | 说明 |
|-----|------|------|
| --status | 否 | 过滤状态：running / idle |
| --agent | 否 | 过滤 Agent 类型 |

**输出：**

```json
{
  "sessions": [
    {
      "session_id": "session_001",
      "name": "DEV-AGENT-001",
      "agent": "DEV-AGENT",
      "workdir": "/path/to/workdir",
      "status": "running",
      "task_desc": "实现用户认证模块",
      "created_at": "2025-02-01T10:00:00Z"
    },
    {
      "session_id": "session_002",
      "name": "TEST-AGENT-001",
      "agent": "TEST-AGENT",
      "workdir": "/path/to/test",
      "status": "idle",
      "task_desc": "",
      "created_at": "2025-02-01T11:00:00Z"
    }
  ]
}
```

#### 4.2.4 cld status

查询单个 Session 的详细状态。

```bash
cld status <session-id>
```

**输出：**

```json
{
  "session_id": "session_001",
  "name": "DEV-AGENT-001",
  "agent": "DEV-AGENT",
  "workdir": "/path/to/workdir",
  "status": "running",
  "task_desc": "实现用户认证模块",
  "pid": 12345,
  "created_at": "2025-02-01T10:00:00Z",
  "last_activity": "2025-02-01T12:30:00Z"
}
```

#### 4.2.5 cld attach

连接到 Session 的终端，进行交互式操作。

```bash
cld attach <session-id>
```

**行为：**
- 连接到指定 Session 的 stdin/stdout
- 支持实时交互
- Ctrl+D 或特定快捷键退出（不终止 Session）

#### 4.2.6 cld inject

向运行中的 Session 注入消息。

```bash
cld inject <session-id> --message <message>
cld inject <session-id> --file <file-path>
```

**参数：**

| 参数 | 必填 | 说明 |
|-----|------|------|
| session-id | 是 | Session ID 或名称 |
| --message | 二选一 | 注入的消息内容 |
| --file | 二选一 | 从文件读取消息内容 |

**输出：**

```json
{
  "session_id": "session_001",
  "injected": true,
  "message_length": 128
}
```

**使用场景：**
- SUMM 主代理通知子 Session 任务变更
- 传递上游 Session 的输出结果
- 系统级通知或指令

#### 4.2.7 cld agent list

列出所有已配置的 Agent。

```bash
cld agent list
```

**输出：**

```json
{
  "agents": [
    {
      "name": "SUMM",
      "description": "SUMM 主代理"
    },
    {
      "name": "DEV-AGENT",
      "description": "开发任务执行 Agent"
    },
    {
      "name": "TEST-AGENT",
      "description": "测试任务执行 Agent"
    }
  ]
}
```

#### 4.2.8 cld agent show

查看 Agent 配置详情。

```bash
cld agent show <agent-name>
```

**输出：**

```json
{
  "name": "DEV-AGENT",
  "description": "开发任务执行 Agent",
  "skills": [
    "/home/user/.claude-daemon/agents/DEV-AGENT/skills/coding.md",
    "/home/user/.claude-daemon/agents/DEV-AGENT/skills/git.md"
  ],
  "claude_md": "/home/user/.claude-daemon/agents/DEV-AGENT/CLAUDE.md",
  "mcp_config": "/home/user/.claude-daemon/agents/DEV-AGENT/mcp.json",
  "env": {
    "HTTP_PROXY": "http://proxy:8080",
    "ANTHROPIC_BASE_URL": "https://api.anthropic.com"
  }
}
```

#### 4.2.9 cld daemon start/stop/status

管理守护进程本身。

```bash
cld daemon start [--port <port>]
cld daemon stop
cld daemon status
```

---

## 5. Tracing 模块

### 5.1 功能概述

通过 Claude Code 原生 Hook 机制，记录 Session 执行过程中的关键信息。

### 5.2 Hook 类型

根据 Claude Code 支持的 Hook，记录以下信息：

| Hook 类型 | 记录内容 |
|----------|---------|
| 会话开始/结束 | 时间戳、Session ID、Agent 类型 |
| 用户输入 | 输入内容、时间戳 |
| 模型响应 | 响应内容、Token 使用量 |
| 工具调用 | 工具名称、参数、结果 |
| 文件操作 | 文件路径、操作类型（读/写/删除） |

### 5.3 Tracing 数据存储

每个 Session 的 Tracing 数据存储在独立目录：

```
~/.claude-daemon/sessions/<session_id>/trace/
├── session.jsonl      # Session 级别事件
├── messages.jsonl     # 消息记录
├── tools.jsonl        # 工具调用记录
└── files.jsonl        # 文件操作记录
```

**数据格式（JSONL）：**

```json
{"timestamp": "2025-02-01T10:00:00Z", "event": "session_start", "session_id": "session_001", "agent": "DEV-AGENT"}
{"timestamp": "2025-02-01T10:00:05Z", "event": "user_input", "content": "实现用户登录功能"}
{"timestamp": "2025-02-01T10:00:10Z", "event": "tool_call", "tool": "write_file", "params": {"path": "/src/login.js"}}
```

### 5.4 Cowork 支持

Tracing 模块同时支持 Cowork（消息注入）功能的实现：

1. `cld inject` 命令触发消息注入
2. 通过 Hook 机制将消息传递给目标 Session
3. 消息以特定格式注入，确保 Claude Code 正确处理

---

## 6. Session 数据模型

### 6.1 Session 元信息 (meta.json)

```json
{
  "session_id": "session_001",
  "name": "DEV-AGENT-001",
  "agent": "DEV-AGENT",
  "workdir": "/path/to/workdir",
  "status": "running",
  "task_desc": "实现用户认证模块",
  "pid": 12345,
  "created_at": "2025-02-01T10:00:00Z",
  "last_activity": "2025-02-01T12:30:00Z"
}
```

### 6.2 状态定义

| 状态 | 说明 |
|-----|------|
| running | Session 正在执行任务 |
| idle | Session 空闲，等待新任务 |

---

## 7. 守护进程管理

### 7.1 启动行为

1. 读取全局配置
2. 加载所有 Agent 配置
3. 恢复之前未正常关闭的 Session（可选）
4. 开始监听命令

### 7.2 进程监控

- 监控所有子进程（Claude Code CLI）状态
- 检测进程异常退出，更新 Session 状态
- 定期清理已结束的 Session 数据（可配置保留时长）

### 7.3 日志管理

```
~/.claude-daemon/logs/
├── daemon.log         # 守护进程日志
├── session_001.log    # 各 Session 日志
└── session_002.log
```

---

## 8. 错误处理

### 8.1 错误码

| 错误码 | 说明 |
|-------|------|
| E001 | Agent 配置不存在 |
| E002 | Session 不存在 |
| E003 | Session 已停止，无法操作 |
| E004 | 工作目录不存在 |
| E005 | 进程启动失败 |
| E006 | 消息注入失败 |
| E007 | 守护进程未运行 |

### 8.2 错误输出格式

```json
{
  "error": true,
  "code": "E002",
  "message": "Session not found: session_999"
}
```

---

## 9. 安全考虑

### 9.1 敏感信息处理

- 环境变量中的 Token 等敏感信息支持引用外部环境变量（如 `${ANTHROPIC_AUTH_TOKEN}`）
- Tracing 数据可配置是否记录敏感内容
- 日志脱敏处理

### 9.2 权限控制

- Daemon 以当前用户权限运行
- Session 工作目录权限检查
- 命令行接口不暴露网络端口（仅本地调用）

---

## 10. 非功能性需求

### 10.1 性能要求

- 支持同时运行 20+ Session
- 命令响应时间 < 100ms
- 进程启动时间 < 2s

### 10.2 可靠性要求

- 守护进程异常退出后，子进程继续运行
- 支持断点恢复（重启 Daemon 后能识别已有 Session）

### 10.3 可观测性

- 完整的日志记录
- Session 生命周期事件追踪
- 资源使用监控（可选）

---

## 11. 待定事项

- Claude Code Hook 的具体实现方式需确认
- 消息注入的具体协议/格式需与 Claude Code 能力对齐
- Tracing 数据的清理策略
- 是否需要提供 HTTP API 接口（除命令行外）
