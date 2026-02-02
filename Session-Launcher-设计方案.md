# Session Launcher 设计方案

## 概述

为 claude-daemon 项目提供 CLI 入口，允许用户快速启动配置好的 agent。每个 agent 可被实例化为多个独立的 session，每个 session 拥有独立的工作目录、环境变量和启动脚本。

---

## 目录结构

```
~/.claude/
  sessions/
    scripts/          # 所有 session 的启动脚本
      agent1-20260202-143022.sh
      my-custom-session.sh
    metadata/         # Session 元数据 (JSON)
      agent1-20260202-143022.json
      my-custom-session.json

/path/to/workspaces/  # 用户指定的工作区根目录
  agent1-20260202-143022/  # Session 工作区
    .claude/
      CLAUDE.md       # Agent 指令
      config.json     # Agent 配置
      .env            # Session 专属环境变量
    # 用户的工作文件
```

---

## CLI 命令

### 命令结构

| 命令 | 说明 |
|------|------|
| `claude-daemon launch [options]` | 创建并启动新 session |
| `claude-daemon resume <session-name>` | 重新进入已有 session |
| `claude-daemon sessions list` | 列出所有 session |
| `claude-daemon sessions delete <name>` | 删除 session |
| `claude-daemon sessions info <name>` | 显示 session 详情 |

### Launch 命令选项

```bash
# 按 agent 启动（创建新目录）
claude-daemon launch --agent coding-assistant
claude-daemon launch --agent coding-assistant --session custom-name

# 使用自定义 session 名称启动
claude-daemon launch --session my-project --agent coding-assistant

# 从已有目录启动（无需指定 agent）
claude-daemon launch --dir /path/to/existing/project

# 环境变量（可选，按 session 隔离）
claude-daemon launch --agent coding-assistant \
  --http-proxy http://proxy:8080 \
  --https-proxy https://proxy:8080 \
  --api-url https://api.anthropic.com \
  --api-token sk-ant-xxx

# 指定工作区根目录
claude-daemon launch --agent coding-assistant --workspace-root ~/projects
```

### 验证规则

- `--agent` 与 `--dir` 互斥，不能同时指定
- 若指定 `--dir`，目录必须存在
- 若指定 `--agent`，agent 必须存在于 `agent-configs/`
- Session 名称必须唯一
- Session 名称必须是有效的目录名（仅允许字母数字、连字符、下划线）

### 环境变量处理

- 存储于 `workspace/.claude/.env`（Session 专属）
- 仅在启动该特定 session 时生效
- 不影响全局环境或其他 session
- 支持的变量：`http_proxy`、`https_proxy`、`ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN`

---

## Session 元数据格式

**文件位置：** `~/.claude/sessions/metadata/{session-name}.json`

```json
{
  "sessionName": "coding-assistant-20260202-143022",
  "agentName": "coding-assistant",
  "workspacePath": "/home/user/workspaces/coding-assistant-20260202-143022",
  "createdAt": "2026-02-02T14:30:22Z",
  "lastAccessedAt": "2026-02-02T14:30:22Z",
  "environment": {
    "http_proxy": "http://proxy:8080",
    "https_proxy": "https://proxy:8080",
    "ANTHROPIC_BASE_URL": "https://api.anthropic.com",
    "ANTHROPIC_AUTH_TOKEN": "sk-ant-xxx"
  },
  "platform": "linux"
}
```

---

## 启动脚本格式

### Linux/macOS

**文件位置：** `~/.claude/sessions/scripts/{session-name}.sh`

```bash
#!/bin/bash
# Session: coding-assistant-20260202-143022
# Agent: coding-assistant
# Created: 2026-02-02T14:30:22Z

# 设置 session 专属环境变量
export http_proxy="http://proxy:8080"
export https_proxy="https://proxy:8080"
export ANTHROPIC_BASE_URL="https://api.anthropic.com"
export ANTHROPIC_AUTH_TOKEN="sk-ant-xxx"

# 切换到工作区目录
cd "/home/user/workspaces/coding-assistant-20260202-143022"

# 启动 Claude Code CLI
exec claude
```

### Windows

**文件位置：** `~/.claude/sessions/scripts/{session-name}.ps1`

```powershell
# Session: coding-assistant-20260202-143022
# Agent: coding-assistant
# Created: 2026-02-02T14:30:22Z

# 设置 session 专属环境变量
$env:http_proxy = "http://proxy:8080"
$env:https_proxy = "https://proxy:8080"
$env:ANTHROPIC_BASE_URL = "https://api.anthropic.com"
$env:ANTHROPIC_AUTH_TOKEN = "sk-ant-xxx"

# 切换到工作区目录
Set-Location "C:\Users\user\workspaces\coding-assistant-20260202-143022"

# 启动 Claude Code CLI
claude
```

### 脚本特性

- 脚本可直接执行
- 环境变量隔离于脚本进程内
- 脚本包含注释形式的元数据，便于阅读
- Unix 上使用 `exec` 替换 shell 进程（更简洁的进程树）
- 脚本根据平台自动生成

---

## Session 生命周期

### 1. 创建 (Create)

命令：`claude-daemon launch --agent coding-assistant` 或 `claude-daemon launch --session my-project`

流程：
1. 创建工作区目录
2. 复制 agent 配置文件到 `workspace/.claude/`
3. 在 `~/.claude/sessions/scripts/` 生成启动脚本
4. 在 `~/.claude/sessions/metadata/` 存储元数据
5. 在工作区中启动 Claude Code CLI

### 2. 重新进入 (Re-enter)

命令：`claude-daemon resume my-project` 或直接运行启动脚本

流程：
1. 读取元数据获取工作区路径
2. 从 `.env` 设置环境变量
3. 在已有工作区中启动 Claude Code CLI

### 3. 列出 (List)

命令：`claude-daemon sessions list`

- 显示所有 session 及状态（运行中/已停止）
- 显示 agent 名称、工作区路径、创建时间

### 4. 删除 (Delete)

命令：`claude-daemon sessions delete my-project`

- 删除启动脚本
- 删除元数据
- 可选删除工作区目录（需确认）

---

## Session 创建工作流

执行 `claude-daemon launch --agent coding-assistant --session my-project` 时：

1. **验证输入**
   - 检查 agent 是否存在于 `agent-configs/`
   - 检查 session 名称是否唯一（无已有元数据文件）
   - 检查 session 名称是否有效（仅字母数字、连字符、下划线）
   - 验证互斥选项（`--agent` vs `--dir`）

2. **确定工作区路径**
   - 若指定 `--workspace-root`：使用该路径
   - 否则：使用当前工作目录
   - 创建 session 目录：`{workspace-root}/{session-name}/`

3. **复制 agent 配置**
   - 创建 `{workspace}/.claude/` 目录
   - 复制 agent 的 `CLAUDE.md` → `{workspace}/.claude/CLAUDE.md`
   - 复制 agent 的 `config.json` → `{workspace}/.claude/config.json`
   - 合并环境变量：
     - 以 agent 的 `.env` 文件为基础（如存在）
     - 用 CLI 参数覆盖（`--http-proxy`、`--api-token` 等）
     - 写入 `{workspace}/.claude/.env`

4. **生成启动脚本**
   - 在 `~/.claude/sessions/scripts/{session-name}.sh`（或 `.ps1`）创建脚本
   - 设置可执行权限（Unix 上 `chmod +x`）
   - 包含合并后的 `.env` 中的所有环境变量

5. **创建元数据**
   - 写入 `~/.claude/sessions/metadata/{session-name}.json`
   - 记录创建时间戳、工作区路径、agent 名称

6. **启动 Claude Code**
   - 从 `.env` 设置环境变量
   - 切换到工作区目录
   - 执行 `claude` CLI（spawn 子进程）
   - 父进程退出，Claude Code 独立运行

### 失败回滚

若任何步骤失败：
- 清理已创建的部分文件
- 删除已创建的工作区目录
- 删除已创建的启动脚本
- 删除已创建的元数据
- 向用户显示清晰的错误信息

---

## Session Resume 工作流

执行 `claude-daemon resume my-project` 时：

1. **定位 session 元数据**
   - 检查 `~/.claude/sessions/metadata/my-project.json` 是否存在
   - 若未找到，显示错误："Session 'my-project' not found"
   - 列出可用 session 作为建议

2. **验证工作区仍存在**
   - 从元数据读取工作区路径
   - 检查目录是否存在
   - 若缺失，提示用户：
     - "Workspace directory not found. Delete session metadata? [y/N]"
     - 若是：清理元数据和启动脚本
     - 若否：退出并报错

3. **更新元数据**
   - 更新 `lastAccessedAt` 时间戳
   - 写回元数据文件

4. **启动 Claude Code**
   - 从元数据读取环境变量
   - 在当前进程设置环境变量
   - 切换到工作区目录
   - 执行 `claude` CLI（spawn 子进程）
   - 父进程退出

### 替代方式：直接执行脚本

用户也可直接运行启动脚本：

```bash
# Unix
~/.claude/sessions/scripts/my-project.sh

# Windows
~/.claude/sessions/scripts/my-project.ps1
```

这绕过了 resume 命令但达到相同效果。脚本不会更新 `lastAccessedAt`，但可以接受。

### Session 名称解析

- 精确匹配：`claude-daemon resume my-project`
- 模糊匹配（可选）：`claude-daemon resume my-proj` → 建议 "my-project"
- 部分匹配多个结果 → 显示列表并要求用户澄清

---

## Session List 工作流

命令：`claude-daemon sessions list`

### 输出格式

```
Active Sessions:

NAME                          AGENT              STATUS    WORKSPACE                           LAST ACCESSED
coding-assistant-20260202     coding-assistant   stopped   ~/workspaces/coding-assistant-...   2 hours ago
my-project                    research-agent     stopped   ~/workspaces/my-project             5 minutes ago
debug-session                 debugging-agent    stopped   ~/workspaces/debug-session          3 days ago

Total: 3 sessions
```

### 过滤选项

```bash
# 按 agent 列出
claude-daemon sessions list --agent coding-assistant

# 列出最近访问的（过去 7 天）
claude-daemon sessions list --recent

# 列出完整路径（不截断）
claude-daemon sessions list --full
```

### 状态检测

- 初始阶段：始终显示 "stopped"（检测运行中的 Claude Code 进程较复杂）
- 未来增强：跟踪 PID 或使用锁文件

---

## Session Delete 工作流

命令：`claude-daemon sessions delete my-project`

### 交互式流程

```
Deleting session: my-project
  Agent: coding-assistant
  Workspace: ~/workspaces/my-project

⚠️  This will remove:
  - Launch script: ~/.claude/sessions/scripts/my-project.sh
  - Metadata: ~/.claude/sessions/metadata/my-project.json

Delete workspace directory? [y/N]: n

✓ Session deleted (workspace preserved)
```

### 删除选项

```bash
# 连同工作区删除（无确认）
claude-daemon sessions delete my-project --with-workspace --force

# 删除多个 session
claude-daemon sessions delete session1 session2 session3

# 删除某 agent 的所有 session
claude-daemon sessions delete --agent coding-assistant --force
```

### 清理行为

- 始终删除：元数据文件、启动脚本
- 可选：工作区目录（除非 `--force`，否则需确认）
- 若文件已缺失：记录警告但继续
- 若工作区有未提交的 git 更改：删除前警告用户

---

## 实现架构

### 新建文件

```
daemon/
  session-manager.ts          # 核心 session 生命周期管理
  session-launcher.ts         # 以环境变量启动 Claude Code CLI

lib/
  session-storage.ts          # 读写 session 元数据和脚本
  session-validator.ts        # 验证 session 名称、路径、冲突

bin/
  cli.js                      # 更新已有 CLI，添加新命令

tools/
  SessionLauncher.ts          # 启动 session 的 CLI 工具
  SessionResume.ts            # 恢复 session 的 CLI 工具
  SessionList.ts              # 列出 session 的 CLI 工具
  SessionDelete.ts            # 删除 session 的 CLI 工具
```

### 核心类

```typescript
// daemon/session-manager.ts
class SessionManager {
  constructor(
    private agentRegistry: AgentDefinitionRegistry,
    private sessionsDir: string  // ~/.claude/sessions
  )

  async createSession(options: CreateSessionOptions): Promise<Session>
  async resumeSession(sessionName: string): Promise<void>
  async listSessions(filters?: SessionFilters): Promise<Session[]>
  async deleteSession(sessionName: string, deleteWorkspace: boolean): Promise<void>
  async getSession(sessionName: string): Promise<Session | null>
}

// lib/session-storage.ts
class SessionStorage {
  async saveMetadata(session: Session): Promise<void>
  async loadMetadata(sessionName: string): Promise<SessionMetadata | null>
  async deleteMetadata(sessionName: string): Promise<void>
  async listAllMetadata(): Promise<SessionMetadata[]>

  async createLaunchScript(session: Session): Promise<string>
  async deleteLaunchScript(sessionName: string): Promise<void>
}

// daemon/session-launcher.ts
class SessionLauncher {
  async launch(session: Session): Promise<void>
  private setEnvironment(env: Record<string, string>): void
  private spawnClaudeCLI(workspacePath: string): ChildProcess
}
```

### 与现有系统集成

- `daemon/main.ts` 在已有服务旁实例化 SessionManager
- Web UI 通过 `web/api/sessions-api.ts` 获得新 API 端点
- Session 创建/删除事件可记录到 daemon 进行跟踪
- 复用已有的 `AgentDefinitionRegistry` 获取 agent 配置
- 复用已有的 `config.ts` 进行路径管理

### 数据流

```
CLI Command → SessionManager → SessionStorage → Filesystem
                          ↓
                    SessionLauncher → Claude Code CLI
```
