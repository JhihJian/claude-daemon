# Claude Code 守护进程 (Daemon) - 完整指南

> 自动记录、分析和监控 Claude Code 会话的守护线程系统

## 🎯 什么是守护进程模式？

传统的 Hook 系统只能被动地记录数据，而**守护进程模式**提供：

- ✅ **常驻后台服务** - 持续运行，实时响应
- ✅ **主动维护** - 定期健康检查、自动清理、索引优化
- ✅ **实时监控** - 即时告警、异常检测、性能追踪
- ✅ **统一调度** - 并发安全、事件队列、智能重试
- ✅ **系统集成** - systemd/launchd 管理、开机自启

## 📦 快速安装

### 自动安装（推荐）

```bash
cd /data/app/claude-history
./install-daemon.sh
```

### 手动安装

```bash
# 1. 安装依赖
curl -fsSL https://bun.sh/install | bash

# 2. 创建目录
mkdir -p ~/.claude/{daemon,hooks,lib,SESSIONS}

# 3. 复制文件
cp -r daemon/* ~/.claude/daemon/
cp -r lib/* ~/.claude/lib/
cp -r hooks-push/* ~/.claude/hooks/
cp bin/claude-daemon ~/bin/

# 4. 设置权限
chmod 700 ~/.claude/daemon ~/.claude/hooks ~/.claude/lib
chmod +x ~/bin/claude-daemon
```

## 🚀 使用方法

### 启动守护进程

```bash
# 方式 1: 使用管理工具
claude-daemon start

# 方式 2: 直接运行
bun ~/.claude/daemon/main.ts

# 方式 3: 系统服务（Linux）
systemctl --user start claude-daemon@$USER

# 方式 4: 系统服务（macOS）
launchctl load ~/Library/LaunchAgents/com.claudecode.daemon.plist
```

### 管理守护进程

```bash
# 查看状态
claude-daemon status

# 停止守护进程
claude-daemon stop

# 重启守护进程
claude-daemon restart

# 查看日志
claude-daemon logs         # 最后 50 行
claude-daemon logs 100     # 最后 100 行

# 实时监控日志
tail -f ~/.claude/daemon.log
```

### 验证守护进程是否工作

```bash
# 1. 检查进程
ps aux | grep "daemon/main.ts"

# 2. 检查 Socket
ls -la /tmp/claude-daemon.sock

# 3. 测试连接
echo '{"hook_name":"test","event_type":"session_start","session_id":"test","timestamp":"2024-01-01T00:00:00Z","data":{}}' | nc -U /tmp/claude-daemon.sock

# 4. 运行 Claude Code 测试
echo "请运行 date 命令" | claude -p

# 5. 检查会话记录
ls -lt ~/.claude/SESSIONS/raw/$(date +%Y-%m)/ | head -3
```

## 🏗️ 架构说明

### 系统架构

```
┌─────────────────────────────────────────┐
│         Claude Code (用户使用)           │
└────────────┬────────────────────────────┘
             │ 触发 Hooks
             ▼
┌─────────────────────────────────────────┐
│          Hooks (轻量推送)                │
│  - SessionRecorder.hook.ts              │
│  - SessionToolCapture.hook.ts           │
│  - SessionAnalyzer.hook.ts              │
└────────────┬────────────────────────────┘
             │ 推送数据 (Unix Socket)
             ▼
┌─────────────────────────────────────────┐
│      Claude Daemon (常驻进程)            │
├─────────────────────────────────────────┤
│  [Hook Server] ← 接收 Hook 数据          │
│       ↓                                  │
│  [Event Queue] ← 并发控制                │
│       ↓                                  │
│  [Session Analyzer] ← 实时分析           │
│       ↓                                  │
│  [Storage Service] ← 统一存储            │
│                                          │
│  [Scheduler] ← 定时任务                  │
│  - 健康检查 (5分钟)                      │
│  - 数据清理 (每天)                       │
│  - 会话监控 (1分钟)                      │
│                                          │
│  [Health Monitor] ← 健康监控             │
│  [Cleanup Service] ← 数据维护            │
└─────────────────────────────────────────┘
             ↓
┌─────────────────────────────────────────┐
│         Storage Layer                    │
│  - Raw Events (JSONL)                   │
│  - Summaries (JSON)                     │
│  - Indexes (by-type, by-directory)      │
└─────────────────────────────────────────┘
```

### 关键组件

#### 1. Hook Server (`daemon/hook-server.ts`)
- 监听 Unix Socket (`/tmp/claude-daemon.sock`)
- 接收来自 Hooks 的推送数据
- 非阻塞异步处理

#### 2. Event Queue (`daemon/event-queue.ts`)
- 事件队列，确保顺序执行
- 避免并发冲突
- 支持最大队列长度限制

#### 3. Session Analyzer (`daemon/session-analyzer.ts`)
- 实时追踪活跃会话
- 自动分类会话类型
- 生成摘要和统计信息

#### 4. Scheduler (`daemon/scheduler.ts`)
- 定时任务调度
- 支持启用/禁用任务
- 错误重试机制

#### 5. Health Monitor (`daemon/health-monitor.ts`)
- 目录结构检查
- 存储使用监控
- Hooks 配置验证
- 索引完整性检查

#### 6. Cleanup Service (`daemon/cleanup-service.ts`)
- 按时间清理过期数据
- 按大小清理最旧数据
- 空目录清理
- 支持干运行模式

## 📊 定时任务

### 默认任务

| 任务名 | 间隔 | 功能 |
|-------|------|-----|
| `health-check` | 5 分钟 | 健康检查（目录、存储、Hooks、索引） |
| `cleanup` | 每天 | 清理超过 90 天的数据 |
| `session-monitor` | 1 分钟 | 监控活跃会话 |

### 自定义任务

编辑 `~/.claude/daemon/main.ts`：

```typescript
// 添加新任务
this.scheduler.register({
  name: 'custom-task',
  interval: 10 * 60 * 1000, // 10 分钟
  enabled: true,
  handler: async () => {
    // 你的逻辑
  },
});
```

## 🛠️ 配置

### 环境变量

```bash
# 日志级别
export SESSION_LOG_LEVEL=DEBUG  # DEBUG|INFO|WARN|ERROR|SILENT

# 路径配置
export PAI_DIR=~/.claude

# 输出长度限制
export MAX_OUTPUT_LENGTH=5000

# 超时配置
export HOOK_TIMEOUT=10000
export GIT_TIMEOUT=3000
```

### 配置文件

创建 `~/.claude/session-config.json`：

```json
{
  "maxOutputLength": 5000,
  "hookTimeout": 10000,
  "gitTimeout": 3000,
  "logLevel": "INFO",
  "classificationThresholds": {
    "coding": 0.4,
    "debugging": 0.0,
    "research": 0.3,
    "writing": 0.5,
    "git": 0.5
  }
}
```

## 🔧 故障排除

### 守护进程无法启动

```bash
# 检查 Bun 是否可用
which bun

# 检查日志
cat ~/.claude/daemon.log

# 手动启动测试
bun ~/.claude/daemon/main.ts
```

### Hooks 不推送数据

```bash
# 检查 Socket 是否存在
ls -la /tmp/claude-daemon.sock

# 测试 Socket 连接
echo '{"test":true}' | nc -U /tmp/claude-daemon.sock

# 检查 Hooks 权限
ls -la ~/.claude/hooks/
```

### 数据未记录

```bash
# 检查会话文件
ls -la ~/.claude/SESSIONS/raw/$(date +%Y-%m)/

# 查看守护进程日志
claude-daemon logs 100

# 检查健康状态
# （需要实现 daemon-ctl status 命令）
```

## 📈 监控与维护

### 健康检查

守护进程每 5 分钟自动执行健康检查：

- ✅ 目录结构完整性
- ✅ 存储使用情况（警告阈值：1GB）
- ✅ Hooks 文件存在性
- ✅ 索引文件完整性

### 数据清理

守护进程每天自动清理：

- 删除超过 90 天的原始事件文件
- 删除超过 90 天的摘要文件
- 如果总存储超过 5GB，删除最旧的文件
- 清理空目录

### 手动维护

```bash
# 查看存储使用
du -sh ~/.claude/SESSIONS

# 手动清理（需要实现）
# bun ~/.claude/tools/cleanup.ts --dry-run
# bun ~/.claude/tools/cleanup.ts --max-age-days 30

# 重建索引（需要实现）
# bun ~/.claude/tools/rebuild-indexes.ts
```

## 🎯 最佳实践

### 1. 监控守护进程状态

```bash
# 添加到 crontab（每小时检查）
0 * * * * pgrep -f "daemon/main.ts" || ~/bin/claude-daemon start
```

### 2. 日志轮转

创建 `/etc/logrotate.d/claude-daemon`:

```
/home/USER/.claude/daemon.log {
    daily
    rotate 7
    compress
    missingok
    notifempty
}
```

### 3. 定期备份

```bash
# 备份会话数据
tar -czf claude-sessions-$(date +%Y%m%d).tar.gz ~/.claude/SESSIONS
```

### 4. 性能优化

- 定期清理旧数据（默认 90 天）
- 限制存储大小（默认 5GB）
- 监控守护进程内存使用

## 🆚 对比：Hook 模式 vs 守护进程模式

| 特性 | Hook 模式 | 守护进程模式 |
|------|----------|-------------|
| 运行方式 | 被动触发 | 主动常驻 |
| 并发处理 | 可能冲突 | 队列保证 |
| 实时分析 | ❌ | ✅ |
| 健康监控 | ❌ | ✅ 每 5 分钟 |
| 自动清理 | ❌ | ✅ 每天 |
| 资源监控 | ❌ | ✅ |
| 异常告警 | ❌ | ✅ |
| 系统集成 | 简单 | systemd/launchd |
| 复杂度 | 低 | 中 |

## 📝 许可证

MIT

## 🙏 致谢

感谢 Claude Code 团队提供的 Hooks 系统。
