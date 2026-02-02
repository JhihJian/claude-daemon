# Claude Daemon - 产品需求文档 (PRD)

**版本:** 1.1  
**日期:** 2025年2月  
**项目定位:** Claude Code CLI 进程管理与 Session 分析服务

---

## 1. 项目概述

### 1.1 项目定位

Claude Daemon（简称 `cld`）是一个常驻后台服务，提供两大核心能力：

1. **进程管理**：管理不同配置的 Claude Code CLI 进程，支持启动、停止、查询、消息注入
2. **Session 分析**：通过 Hook 机制记录、分类、分析 Claude Code Session 的执行过程

### 1.2 与其他项目的关系

| 项目 | 关系 |
|-----|------|
| SUMM Console | Console 后端通过 `cld` 命令管理进程、查询 Session 数据 |
| SUMM Agent | Daemon 启动的 SUMM 主代理使用 SUMM Agent 定义的配置 |

### 1.3 核心能力

| 能力 | 说明 |
|-----|------|
| 进程管理 | 启动、停止、查询 Claude Code CLI 进程 |
| 配置管理 | 管理不同 Agent 的配置（Skills、CLAUDE.md、MCP、环境变量） |
| 消息注入 | 向运行中的 Session 注入消息，支持 Agent 间协同 |
| Tracing | 通过 Hook 记录 Session/项目/过程信息 |
| Session 分析 | 智能分类、统计分析、多维索引 |
| Web UI | Session 历史可视化（可选） |

---

## 2. 系统架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Claude Daemon (cld)                           │
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │   CLI 接口      │  │   进程管理器     │  │      配置管理           │  │
│  │  - cld start   │  │  - 启动进程      │  │  - Agent 配置           │  │
│  │  - cld stop    │  │  - 停止进程      │  │  - 环境变量             │  │
│  │  - cld list    │  │  - PID 跟踪      │  │  - MCP/Skills           │  │
│  │  - cld inject  │  │  - 健康监控      │  │                         │  │
│  │  - cld attach  │  │  - IO 管理       │  │                         │  │
│  └────────┬────────┘  └────────┬────────┘  └─────────────────────────┘  │
│           │                    │                                        │
│           │                    ▼                                        │
│           │         ┌─────────────────────┐                             │
│           │         │    Session 池       │                             │
│           │         │  ┌───┐ ┌───┐ ┌───┐  │                             │
│           │         │  │S1 │ │S2 │ │S3 │  │  ← 运行中的 Claude Code    │
│           │         │  └───┘ └───┘ └───┘  │    CLI 进程                │
│           │         └─────────────────────┘                             │
│           │                    │                                        │
│  ┌────────▼────────────────────▼────────────────────────────────────┐   │
│  │                      Tracing 模块                                │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │   │
│  │  │  Hook Server │  │  Event Queue │  │  Session Analyzer    │   │   │
│  │  │  (接收事件)   │  │  (事件缓冲)   │  │  (分类/统计/索引)    │   │   │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                 │                                       │
│                                 ▼                                       │
│                    ┌─────────────────────────┐                          │
│                    │     Storage Service     │                          │
│                    │  - JSONL 事件日志       │                          │
│                    │  - Session 元数据       │                          │
│                    │  - 分类索引             │                          │
│                    └─────────────────────────┘                          │
│                                 │                                       │
│                                 ▼                                       │
│                    ┌─────────────────────────┐                          │
│                    │    Web UI (可选)        │                          │
│                    │  - Session 历史浏览     │                          │
│                    │  - 统计图表             │                          │
│                    └─────────────────────────┘                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 目录结构

```
~/.claude-daemon/
├── config.json                  # Daemon 全局配置
├── daemon.pid                   # Daemon 进程 PID 文件
├── daemon.sock                  # Unix Socket（IPC 通信）
│
├── agents/                      # Agent 配置目录
│   ├── SUMM/
│   │   ├── agent.json           # Agent 配置
│   │   ├── CLAUDE.md            # 系统提示词
│   │   ├── skills/              # Skill 文件
│   │   └── mcp.json             # MCP 配置
│   ├── DEV-AGENT/
│   │   └── ...
│   └── TEST-AGENT/
│       └── ...
│
├── sessions/                    # Session 数据目录
│   ├── session_001/
│   │   ├── meta.json            # Session 元信息
│   │   ├── workspace/           # Session 工作目录
│   │   └── trace/               # Tracing 数据
│   │       ├── events.jsonl     # 原始事件日志
│   │       ├── summary.json     # 分析摘要
│   │       └── classification.json  # 分类结果
│   └── session_002/
│       └── ...
│
├── index/                       # 索引目录
│   ├── by-agent.json            # 按 Agent 类型索引
│   ├── by-date.json             # 按日期索引
│   ├── by-type.json             # 按 Session 类型索引
│   └── by-project.json          # 按项目索引
│
└── logs/                        # 日志目录
    ├── daemon.log               # Daemon 日志
    └── error.log                # 错误日志
```

---

## 4. Agent 配置管理

### 4.1 配置项

每个 Agent 类型包含以下配置：

| 配置项 | 说明 | 示例 |
|-------|------|------|
| name | Agent 类型名称 | `SUMM`, `DEV-AGENT`, `TEST-AGENT` |
| description | Agent 描述 | `开发任务执行 Agent` |
| skills | Skill 文件路径列表 | `["skills/coding.md"]` |
| claude_md | CLAUDE.md 文件路径 | `CLAUDE.md` |
| mcp_config | MCP 配置文件路径 | `mcp.json` |
| env | 环境变量 | 见下表 |

**环境变量配置：**

| 变量名 | 说明 |
|-------|------|
| HTTP_PROXY | HTTP 代理 |
| HTTPS_PROXY | HTTPS 代理 |
| ANTHROPIC_BASE_URL | Anthropic API 地址 |
| ANTHROPIC_AUTH_TOKEN | Anthropic 认证令牌 |

### 4.2 Agent 配置文件格式 (agent.json)

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

## 5. 命令行接口

### 5.1 命令概览

| 分类 | 命令 | 说明 |
|-----|-----|------|
| **进程管理** | `cld start` | 启动新 Session |
| | `cld stop` | 停止 Session |
| | `cld list` | 列出所有 Session |
| | `cld status` | 查询 Session 状态 |
| | `cld attach` | 连接到 Session 终端 |
| | `cld inject` | 向 Session 注入消息 |
| **Agent 管理** | `cld agent list` | 列出所有 Agent 配置 |
| | `cld agent show` | 查看 Agent 配置详情 |
| **Session 分析** | `cld sessions list` | 列出历史 Session |
| | `cld sessions show` | 查看 Session 详情 |
| | `cld sessions delete` | 删除 Session 数据 |
| **Daemon 管理** | `cld daemon start` | 启动守护进程 |
| | `cld daemon stop` | 停止守护进程 |
| | `cld daemon status` | 查看守护进程状态 |
| **安装配置** | `cld install` | 安装 Hooks |
| | `cld uninstall` | 卸载 Hooks |

### 5.2 进程管理命令

#### 5.2.1 cld start

启动新的 Claude Code CLI Session。

```bash
cld start --agent <agent-name> --workdir <path> [--name <session-name>]
```

**参数：**

| 参数 | 必填 | 说明 |
|-----|------|------|
| --agent | 是 | Agent 类型名称 |
| --workdir | 是 | 工作目录路径（用户项目目录） |
| --name | 否 | 自定义 Session 名称，默认自动生成 |

**行为：**
1. 验证 Agent 配置存在
2. 创建 Session 目录 `~/.claude-daemon/sessions/<session_id>/`
3. 复制 Agent 配置到 Session 工作空间
4. 启动 Claude Code CLI 进程
5. 记录 PID，开始监控
6. 返回 Session 信息

**输出：**

```json
{
  "session_id": "session_001",
  "name": "DEV-AGENT-001",
  "agent": "DEV-AGENT",
  "workdir": "/path/to/project",
  "status": "running",
  "pid": 12345,
  "created_at": "2025-02-01T10:00:00Z"
}
```

#### 5.2.2 cld stop

停止指定 Session。

```bash
cld stop <session-id> [--force]
```

**参数：**

| 参数 | 必填 | 说明 |
|-----|------|------|
| session-id | 是 | Session ID 或名称 |
| --force | 否 | 强制终止（SIGKILL） |

**输出：**

```json
{
  "session_id": "session_001",
  "status": "stopped",
  "stopped_at": "2025-02-01T12:00:00Z"
}
```

#### 5.2.3 cld list

列出所有运行中的 Session。

```bash
cld list [--status <status>] [--agent <agent-name>] [--all]
```

**参数：**

| 参数 | 必填 | 说明 |
|-----|------|------|
| --status | 否 | 过滤状态：running / idle |
| --agent | 否 | 过滤 Agent 类型 |
| --all | 否 | 包含已停止的 Session |

**输出：**

```json
{
  "sessions": [
    {
      "session_id": "session_001",
      "name": "DEV-AGENT-001",
      "agent": "DEV-AGENT",
      "workdir": "/path/to/project",
      "status": "running",
      "task_desc": "实现用户认证模块",
      "pid": 12345,
      "created_at": "2025-02-01T10:00:00Z",
      "last_activity": "2025-02-01T12:30:00Z"
    }
  ]
}
```

#### 5.2.4 cld status

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
  "workdir": "/path/to/project",
  "status": "running",
  "task_desc": "实现用户认证模块",
  "pid": 12345,
  "created_at": "2025-02-01T10:00:00Z",
  "last_activity": "2025-02-01T12:30:00Z",
  "stats": {
    "duration_seconds": 9000,
    "tool_calls": 45,
    "files_modified": 12
  }
}
```

#### 5.2.5 cld attach

连接到 Session 的终端，进行交互式操作。

```bash
cld attach <session-id>
```

**行为：**
- 连接到指定 Session 的 stdin/stdout
- 支持实时交互
- `Ctrl+D` 退出（不终止 Session）

#### 5.2.6 cld inject

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
  "message_length": 128,
  "timestamp": "2025-02-01T12:30:00Z"
}
```

**使用场景：**
- SUMM 主代理通知子 Session 任务变更
- 传递上游 Session 的输出结果
- 系统级通知或指令

### 5.3 Agent 管理命令

#### 5.3.1 cld agent list

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
      "description": "SUMM 主代理",
      "skills_count": 5
    },
    {
      "name": "DEV-AGENT",
      "description": "开发任务执行 Agent",
      "skills_count": 3
    }
  ]
}
```

#### 5.3.2 cld agent show

查看 Agent 配置详情。

```bash
cld agent show <agent-name>
```

**输出：**

```json
{
  "name": "DEV-AGENT",
  "description": "开发任务执行 Agent",
  "path": "~/.claude-daemon/agents/DEV-AGENT",
  "skills": [
    "skills/coding.md",
    "skills/git.md"
  ],
  "claude_md": "CLAUDE.md",
  "mcp_config": "mcp.json",
  "env": {
    "HTTP_PROXY": "http://proxy:8080",
    "ANTHROPIC_BASE_URL": "https://api.anthropic.com"
  }
}
```

### 5.4 Session 分析命令

#### 5.4.1 cld sessions list

列出历史 Session 记录。

```bash
cld sessions list [--agent <agent>] [--type <type>] [--date <date>] [--limit <n>]
```

**参数：**

| 参数 | 必填 | 说明 |
|-----|------|------|
| --agent | 否 | 过滤 Agent 类型 |
| --type | 否 | 过滤 Session 类型（分类结果） |
| --date | 否 | 过滤日期（YYYY-MM-DD） |
| --limit | 否 | 返回数量限制，默认 20 |

**输出：**

```json
{
  "sessions": [
    {
      "session_id": "session_001",
      "agent": "DEV-AGENT",
      "classification": "coding",
      "duration_seconds": 3600,
      "tool_usage": {"Edit": 15, "Read": 23, "Bash": 8},
      "files_modified": ["src/auth.ts", "src/login.ts"],
      "created_at": "2025-02-01T10:00:00Z",
      "completed_at": "2025-02-01T11:00:00Z"
    }
  ],
  "total": 156
}
```

#### 5.4.2 cld sessions show

查看 Session 详细信息。

```bash
cld sessions show <session-id> [--trace] [--summary]
```

**参数：**

| 参数 | 必填 | 说明 |
|-----|------|------|
| --trace | 否 | 包含完整 Trace 事件 |
| --summary | 否 | 包含 AI 生成的摘要 |

#### 5.4.3 cld sessions delete

删除 Session 数据。

```bash
cld sessions delete <session-id>
cld sessions delete --before <date>
```

### 5.5 Daemon 管理命令

#### 5.5.1 cld daemon start

启动守护进程。

```bash
cld daemon start [--port <port>]
```

#### 5.5.2 cld daemon stop

停止守护进程。

```bash
cld daemon stop
```

#### 5.5.3 cld daemon status

查看守护进程状态。

```bash
cld daemon status
```

**输出：**

```json
{
  "status": "running",
  "pid": 9876,
  "uptime_seconds": 86400,
  "active_sessions": 3,
  "total_sessions_tracked": 156,
  "hook_server": "listening",
  "web_ui": "http://localhost:3000"
}
```

### 5.6 安装配置命令

#### 5.6.1 cld install

安装 Claude Code Hooks。

```bash
cld install
```

**行为：**
- 配置 Claude Code 的 Hook 指向 Daemon
- 创建必要的目录结构
- 验证安装成功

#### 5.6.2 cld uninstall

卸载 Hooks。

```bash
cld uninstall
```

---

## 6. 进程管理模块

### 6.1 进程生命周期

```
创建请求 → 验证配置 → 创建工作空间 → 启动进程 → 监控运行 → 停止/异常退出 → 清理
```

### 6.2 进程状态

| 状态 | 说明 |
|-----|------|
| starting | 进程正在启动 |
| running | 进程运行中，正在执行任务 |
| idle | 进程运行中，等待输入 |
| stopping | 进程正在停止 |
| stopped | 进程已停止 |
| error | 进程异常退出 |

### 6.3 进程监控

- 定期检查进程存活（通过 PID）
- 检测进程异常退出，记录退出码
- 监控进程资源使用（可选）
- 检测 idle/running 状态变化

### 6.4 IO 管理

- 管理每个 Session 的 stdin/stdout/stderr
- 支持 `attach` 命令连接终端
- 支持 `inject` 命令写入 stdin
- 日志记录所有 IO（用于 Tracing）

### 6.5 消息注入机制

消息注入通过向 Claude Code CLI 进程的 stdin 写入实现：

1. 接收 `cld inject` 命令
2. 查找目标 Session 的进程
3. 格式化消息（可配置前缀/格式）
4. 写入进程 stdin
5. 记录注入事件到 Trace

---

## 7. Tracing 模块

### 7.1 Hook 机制

通过 Claude Code 原生 Hook 机制，Daemon 接收并记录以下事件：

| 事件类型 | 说明 | 记录内容 |
|---------|------|---------|
| session_start | Session 开始 | session_id, agent, workdir, timestamp |
| session_end | Session 结束 | session_id, duration, exit_code |
| user_input | 用户输入 | content, timestamp |
| assistant_response | 模型响应 | content, tokens, timestamp |
| tool_call | 工具调用 | tool_name, params, result |
| file_read | 文件读取 | file_path |
| file_write | 文件写入 | file_path, size |
| file_delete | 文件删除 | file_path |

### 7.2 事件存储

每个 Session 的事件存储在 JSONL 文件中：

```
~/.claude-daemon/sessions/<session_id>/trace/events.jsonl
```

**格式：**

```jsonl
{"ts":"2025-02-01T10:00:00Z","event":"session_start","session_id":"s001","agent":"DEV-AGENT"}
{"ts":"2025-02-01T10:00:05Z","event":"user_input","content":"实现用户登录功能"}
{"ts":"2025-02-01T10:00:10Z","event":"tool_call","tool":"write_file","params":{"path":"src/login.ts"}}
{"ts":"2025-02-01T10:00:15Z","event":"assistant_response","tokens":{"input":150,"output":500}}
```

### 7.3 Session 分析

Session 完成后，Analyzer 自动执行：

#### 7.3.1 Session 分类

将 Session 分为以下类型：

| 类型 | 说明 |
|-----|------|
| coding | 编码开发 |
| debugging | 调试修复 |
| refactoring | 重构优化 |
| documentation | 文档编写 |
| configuration | 配置管理 |
| exploration | 探索学习 |
| other | 其他 |

#### 7.3.2 统计分析

生成 Session 统计摘要：

```json
{
  "session_id": "session_001",
  "classification": "coding",
  "duration_seconds": 3600,
  "tool_usage": {
    "Edit": 15,
    "Read": 23,
    "Bash": 8,
    "Write": 5
  },
  "files_modified": [
    "src/auth.ts",
    "src/login.ts"
  ],
  "tokens": {
    "input": 15000,
    "output": 8000
  },
  "git_repo": "my-project",
  "branches": ["main", "feature/auth"]
}
```

#### 7.3.3 多维索引

建立索引支持快速查询：

- 按 Agent 类型
- 按日期
- 按 Session 类型
- 按项目/Git 仓库

### 7.4 Web UI（可选）

提供 Web 界面用于 Session 历史可视化：

- Session 列表浏览
- 统计图表
- 详情查看
- 搜索过滤

**访问方式：**
```bash
cld daemon status  # 查看 Web UI 地址
```

---

## 8. Session 数据模型

### 8.1 Session 元信息 (meta.json)

```json
{
  "session_id": "session_001",
  "name": "DEV-AGENT-001",
  "agent": "DEV-AGENT",
  "workdir": "/path/to/project",
  "status": "running",
  "pid": 12345,
  "task_desc": "实现用户认证模块",
  "created_at": "2025-02-01T10:00:00Z",
  "started_at": "2025-02-01T10:00:01Z",
  "completed_at": null,
  "last_activity": "2025-02-01T12:30:00Z",
  "classification": null,
  "stats": {
    "duration_seconds": 9000,
    "tool_calls": 45,
    "files_modified": 12,
    "tokens_input": 15000,
    "tokens_output": 8000
  }
}
```

### 8.2 状态定义

| 状态 | 说明 | 是否有进程 |
|-----|------|----------|
| running | 正在执行任务 | 是 |
| idle | 等待输入 | 是 |
| stopped | 已停止 | 否 |
| error | 异常退出 | 否 |

---

## 9. 全局配置 (config.json)

```json
{
  "daemon": {
    "socket_path": "~/.claude-daemon/daemon.sock",
    "pid_file": "~/.claude-daemon/daemon.pid",
    "log_level": "info"
  },
  "hook_server": {
    "type": "unix_socket",
    "path": "~/.claude-daemon/hook.sock"
  },
  "web_ui": {
    "enabled": true,
    "port": 3000
  },
  "storage": {
    "base_path": "~/.claude-daemon",
    "retention_days": 30
  },
  "process": {
    "max_sessions": 50,
    "health_check_interval": 5000,
    "idle_timeout": null
  }
}
```

---

## 10. 错误处理

### 10.1 错误码

| 错误码 | 说明 |
|-------|------|
| E001 | Agent 配置不存在 |
| E002 | Session 不存在 |
| E003 | Session 已停止，无法操作 |
| E004 | 工作目录不存在或无权限 |
| E005 | 进程启动失败 |
| E006 | 消息注入失败 |
| E007 | 守护进程未运行 |
| E008 | Hook 未安装 |
| E009 | 已达到最大 Session 数量 |

### 10.2 错误输出格式

```json
{
  "error": true,
  "code": "E002",
  "message": "Session not found: session_999"
}
```

---

## 11. 非功能性需求

### 11.1 性能要求

| 指标 | 目标 |
|-----|------|
| 并发 Session | 支持 50+ |
| 命令响应时间 | < 100ms |
| 进程启动时间 | < 2s |
| Hook 事件处理延迟 | < 50ms |

### 11.2 可靠性要求

- Daemon 异常退出后，子进程继续运行
- 重启 Daemon 后能识别已有运行中的 Session
- 数据持久化，防止丢失

### 11.3 安全考虑

- 环境变量中的敏感信息支持引用外部变量
- Tracing 数据可配置是否记录敏感内容
- Unix Socket 通信，不暴露网络端口
- 权限检查（工作目录、配置文件）

---

## 12. 实现路线图

### Phase 1: 基础进程管理
- [ ] `cld start` / `cld stop` 命令
- [ ] 进程 PID 跟踪
- [ ] Session 状态管理
- [ ] `cld list` / `cld status` 命令

### Phase 2: 终端交互
- [ ] `cld attach` 命令
- [ ] IO 流管理
- [ ] `cld inject` 消息注入

### Phase 3: Tracing 增强
- [ ] 整合现有 Hook 系统
- [ ] Session 分析器完善
- [ ] 索引系统

### Phase 4: 完善与优化
- [ ] Web UI 整合
- [ ] 性能优化
- [ ] 文档完善

---

## 13. 待定事项

- 消息注入的具体格式/协议
- Idle 状态检测的具体实现（监控 stdout 还是其他机制）
- Web UI 是否整合到 SUMM Console
- Session 数据清理策略的具体配置项
