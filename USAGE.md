# Claude Daemon 使用指南

## 快速开始

### 1. 启动守护进程

```bash
# 基础启动（无 Web UI）
bun daemon/main.ts

# 启动带 Web UI（推荐）
bun daemon/main.ts --web --port 3001

# 后台运行
bun daemon/main.ts --web --port 3001 > ~/.claude/daemon.log 2>&1 &
```

启动成功后会看到：
```
✓ Hook server started
✓ Loaded 3 agent configuration(s)
✓ Restored 0 active session(s)
✓ Scheduler started
✓ Web UI started
🚀 Claude Daemon started successfully
   Web UI: http://127.0.0.1:3001
   Agent configs: master-agent, analyzer-agent, default
```

### 2. 配置代理（Agent）

代理配置位于 `agent-configs/` 目录：

```
agent-configs/
├── master-agent/
│   └── .claude/
│       ├── config.json      # 代理配置
│       ├── CLAUDE.md        # 系统提示词
│       └── .env             # 环境变量（可选）
├── analyzer-agent/
│   └── .claude/
│       ├── config.json
│       └── CLAUDE.md
└── default/                 # 自动创建
```

#### 创建新代理

```bash
# 1. 创建目录结构
mkdir -p agent-configs/my-agent/.claude

# 2. 创建 config.json
cat > agent-configs/my-agent/.claude/config.json << 'EOF'
{
  "name": "my-agent",
  "description": "My custom agent",
  "version": "1.0.0",
  "skills": ["skill1", "skill2"],
  "mcpServers": []
}
EOF

# 3. 创建 CLAUDE.md（系统提示词）
cat > agent-configs/my-agent/.claude/CLAUDE.md << 'EOF'
# My Agent

You are a specialized agent for...
EOF

# 4. 创建 .env（可选，用于环境变量）
cat > agent-configs/my-agent/.claude/.env << 'EOF'
API_KEY=your-secret-key
DATABASE_URL=postgresql://...
EOF
chmod 600 agent-configs/my-agent/.claude/.env
```

### 3. 使用代理启动会话

#### 方式 1: 通过 Web UI（推荐）

1. 访问 http://127.0.0.1:3001
2. 导航到 `/launch` 页面
3. 选择代理配置
4. 输入工作目录
5. 点击"启动会话"

#### 方式 2: 通过 API

```bash
# 启动会话
curl -X POST "http://127.0.0.1:3001/api/sessions/launch?agentName=master-agent&workingDirectory=/path/to/project"
```

#### 方式 3: 手动启动（设置环境变量）

```bash
# 设置代理配置
export CLAUDE_AGENT_CONFIG=master-agent

# 启动 Claude CLI
claude
```

### 4. 查看活动会话

```bash
# 通过 API
curl http://127.0.0.1:3001/api/sessions/active

# 响应示例
[
  {
    "session_id": "abc123",
    "agent_name": "master-agent",
    "pid": 12345,
    "status": "active",
    "start_time": "2026-02-01T10:00:00Z",
    "working_directory": "/path/to/project",
    "git_repo": "my-repo",
    "git_branch": "main"
  }
]
```

### 5. 查询归档会话

```bash
# 查询所有归档会话
curl "http://127.0.0.1:3001/api/sessions/archive?limit=50"

# 按代理过滤
curl "http://127.0.0.1:3001/api/sessions/archive?agent=master-agent&limit=20"

# 按目录过滤
curl "http://127.0.0.1:3001/api/sessions/archive?directory=/path/to/project"

# 按日期范围过滤
curl "http://127.0.0.1:3001/api/sessions/archive?startDate=2026-02-01&endDate=2026-02-28"
```

### 6. 管理代理配置

```bash
# 列出所有代理
curl http://127.0.0.1:3001/api/agents

# 获取特定代理详情
curl http://127.0.0.1:3001/api/agents/master-agent

# 重新加载代理配置
curl -X POST http://127.0.0.1:3001/api/agents/master-agent/reload

# 查看环境变量键（不显示值）
curl http://127.0.0.1:3001/api/agents/master-agent/environment
```

## API 端点完整列表

### 代理管理

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/agents` | 列出所有代理配置 |
| GET | `/api/agents/:name` | 获取代理详情和统计 |
| POST | `/api/agents/:name/reload` | 重新加载代理配置 |
| GET | `/api/agents/:name/environment` | 获取环境变量键名 |

### 会话管理

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/sessions/active` | 列出活动会话 |
| GET | `/api/sessions/active/:id` | 获取活动会话详情 |
| POST | `/api/sessions/launch` | 启动新会话 |
| POST | `/api/sessions/:id/terminate` | 终止会话 |
| GET | `/api/sessions/archive` | 查询归档会话 |
| GET | `/api/sessions/archive/:id` | 获取归档会话详情 |

### 统计信息（现有）

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/stats/global` | 全局统计 |
| GET | `/api/stats/types` | 会话类型分布 |
| GET | `/api/stats/timeline` | 时间线数据 |

## 数据存储

### 目录结构

```
~/.claude/SESSIONS/
├── active-sessions.json          # 活动会话状态
├── archive/                      # 归档会话
│   └── 2026-02/
│       └── sessions.jsonl        # 按月归档
├── raw/                          # 原始事件
│   └── 2026-02/
│       └── session-*.jsonl
└── analysis/                     # 分析数据
    ├── summaries/
    ├── by-type/
    └── by-directory/
```

### 文件权限

- 文件：`0600` (仅所有者可读写)
- 目录：`0700` (仅所有者可访问)

## 工作流示例

### 场景 1: 使用特定代理进行代码分析

```bash
# 1. 启动守护进程
bun daemon/main.ts --web --port 3001 &

# 2. 启动分析代理会话
export CLAUDE_AGENT_CONFIG=analyzer-agent
cd /path/to/project
claude

# 3. 在 Claude 中执行分析任务
# SessionTracker 钩子会自动注册会话

# 4. 退出后查看会话记录
curl "http://127.0.0.1:3001/api/sessions/archive?agent=analyzer-agent&limit=1"
```

### 场景 2: 通过 API 启动多个会话

```bash
# 启动多个不同代理的会话
curl -X POST "http://127.0.0.1:3001/api/sessions/launch?agentName=master-agent&workingDirectory=/project1"
curl -X POST "http://127.0.0.1:3001/api/sessions/launch?agentName=analyzer-agent&workingDirectory=/project2"

# 查看所有活动会话
curl http://127.0.0.1:3001/api/sessions/active
```

### 场景 3: 守护进程重启后恢复

```bash
# 1. 守护进程运行中，有活动会话
# 2. 守护进程崩溃或重启
# 3. 重新启动守护进程
bun daemon/main.ts --web --port 3001

# 输出会显示：
# ✓ Restored 2 active session(s)
#
# 系统会：
# - 检查进程是否仍在运行
# - 恢复活动会话到内存
# - 归档已终止的会话
```

## 故障排查

### 守护进程无法启动

```bash
# 检查端口是否被占用
lsof -i :3001

# 检查 socket 文件
ls -la /tmp/claude-daemon.sock

# 查看日志
tail -f ~/.claude/daemon.log
```

### 会话未注册

```bash
# 1. 确认守护进程正在运行
ps aux | grep "bun daemon/main.ts"

# 2. 检查 socket 连接
echo '{"test":true}' | nc -U /tmp/claude-daemon.sock

# 3. 查看 fallback 文件
cat ~/.claude/SESSIONS/fallback/session-tracker.jsonl
```

### 代理配置未加载

```bash
# 1. 检查配置文件格式
cat agent-configs/my-agent/.claude/config.json | jq .

# 2. 重新加载配置
curl -X POST http://127.0.0.1:3001/api/agents/my-agent/reload

# 3. 查看守护进程日志
grep "AgentDefinitionRegistry" ~/.claude/daemon.log
```

## 安全注意事项

1. **环境变量保护**
   - `.env` 文件必须设置为 `0600` 权限
   - API 永远不会返回环境变量的值，只返回键名

2. **本地访问**
   - Web UI 默认绑定到 `127.0.0.1`（仅本地访问）
   - 不要将其暴露到公网

3. **会话数据**
   - 所有会话数据存储在 `~/.claude/SESSIONS/`
   - 文件权限自动设置为仅所有者可访问

## 性能特性

- **启动时间**: ~20ms（不含插件）
- **代理加载**: 3个代理 <5ms
- **会话注册**: <2ms（含持久化）
- **归档查询**: <10ms（1000条记录）
- **并发安全**: 写入锁防止冲突

## 下一步

1. **创建自定义代理** - 根据你的需求配置专用代理
2. **集成到工作流** - 在 CI/CD 或开发流程中使用
3. **开发 Web UI** - 创建前端页面使用 API
4. **监控和分析** - 使用归档数据分析使用模式

## 参考资料

- 设计文档: `Claude-Daemon 改进设计文档.md`
- 测试报告: `TEST_REPORT.md`
- 项目说明: `CLAUDE.md`
