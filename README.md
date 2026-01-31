# Claude Code 守护进程（Daemon）

> 🚀 自动记录、分析和监控 Claude Code 会话的守护线程系统

[![GitHub](https://img.shields.io/badge/GitHub-claude--daemon-blue?logo=github)](https://github.com/JhihJian/claude-daemon)
[![Bun](https://img.shields.io/badge/Bun-1.0+-black?logo=bun)](https://bun.sh)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Test](https://img.shields.io/badge/Tests-12%2F12%20Passed-success)](FINAL-TEST-REPORT.md)

## ✨ 特性

### 🎯 守护线程架构

- ✅ **常驻后台服务** - 持续运行，实时响应
- ✅ **主动维护** - 定期健康检查、自动清理、索引优化
- ✅ **实时监控** - 即时告警、异常检测、性能追踪
- ✅ **统一调度** - 并发安全、事件队列、智能重试
- ✅ **系统集成** - systemd/launchd 管理、开机自启

### 📦 核心功能

- 🔍 **自动记录** - 捕获每个会话的启动目录、Git 信息、工具调用
- 🏷️ **智能分类** - 自动识别会话类型（编码、调试、研究、写作、Git 操作等）
- 📊 **多维索引** - 按类型、按目录、按主机名、按时间快速查询
- 📈 **统计分析** - 会话统计、类型分布、活跃目录分析
- 💾 **JSONL 存储** - 流式写入，易于解析和处理

### 🔌 插件系统

- 🧩 **可扩展架构** - 通过插件扩展守护进程功能
- 🔗 **IPC 命令** - 插件可注册自定义命令，通过 Unix Socket 访问
- 🎯 **事件总线** - 插件可监听和发送事件
- 🔄 **热加载** - 支持插件的加载、卸载和重新加载
- 💡 **示例插件** - 包含 OpenAI Proxy 插件示例

### 🌐 Web UI

- 📊 **可视化界面** - 实时查看会话历史和统计信息
- 🔄 **实时更新** - 通过 WebSocket 实时推送会话更新
- 📈 **图表展示** - 会话类型分布、工具使用统计
- 🎨 **现代设计** - 响应式界面，支持深色模式

### ⚡ 性能

| 指标 | 数值 |
|------|------|
| 启动时间 | < 1秒 |
| Socket 响应 | < 10ms |
| 内存占用 | ~50MB |
| CPU 占用 | < 1%（空闲） |

---

## 🔄 最近更新

### v1.3.4 (2026-01-31)

**🎯 全面测试与修复：**
- ✅ **Windows 平台完整支持** - 实现 TCP Socket IPC (127.0.0.1:39281)
  - 解决 Bun v1.3.5 Windows 命名管道崩溃问题
  - 使用 TCP Socket 作为替代方案，性能影响可忽略 (<0.2ms)
  - 完全透明，用户无需配置
- ✅ **Hook 错误处理增强** - 所有 6 个 hooks 添加防御性错误处理
  - 处理空输入和无效 JSON
  - 优雅降级，不影响 Claude Code 执行
  - 消除 "SessionStart:startup hook error" 错误
- ✅ **API 端点修复** - 修复 `/api/sessions/recent` 方法名不匹配
- ✅ **端口配置统一** - Web UI 默认端口更新为 3001
- ✅ **代码仓库清理** - 移除临时文件和无效文件

**📊 测试覆盖：**
- ✅ 静态分析：9 个问题识别并记录
- ✅ 组件测试：22/22 通过 (100%)
- ✅ 集成测试：7/7 API 端点正常 (100%)
- ✅ Windows IPC：TCP Socket 通信验证通过

**📚 文档更新：**
- 新增 Windows 平台 IPC 机制说明
- 新增 Windows 特定故障排查指南
- 更新配置文档和环境变量说明

### v1.3.3 (2026-01-25)

**🔧 关键修复：**
- ✅ 修复插件 IPC 命令与 Hook Server 的集成
  - 插件命令现在可通过 Unix Socket 访问
  - 自动注册和清理命令处理器
- ✅ 修复 SessionToolCapture hook 架构
  - 改为推送事件到守护进程（而非直接写文件）
  - 添加 2 秒超时和文件写入回退机制
- ✅ 添加 CLI 参数解析
  - 支持 `--web` 启用 Web UI
  - 支持 `--port` 指定端口
  - 支持 `--help` 显示帮助
- ✅ 更新 npm 包配置
  - 包含 daemon/、plugins/、web/ 目录

**🎯 测试结果：**
- ✅ 守护进程启动测试通过
- ✅ 插件系统加载测试通过
- ✅ Hook 事件推送测试通过
- ✅ CLI 参数解析测试通过
- ✅ Web UI 功能验证通过

---

## 🚀 快速开始

### 一键安装

```bash
# 克隆仓库
git clone https://github.com/JhihJian/claude-daemon.git
cd claude-daemon

# 运行安装脚本
./install-daemon.sh
```

安装脚本会自动：
- ✅ 安装 Bun 运行时（如果未安装）
- ✅ 创建目录结构
- ✅ 配置守护进程服务
- ✅ 安装推送模式 Hooks
- ✅ 设置系统服务（systemd/launchd）
- ✅ 启动守护进程

### 管理守护进程

```bash
# 启动守护进程
claude-daemon start

# 启动守护进程并启用 Web UI
bun daemon/main.ts --web --port 3000

# 停止守护进程
claude-daemon stop

# 重启守护进程
claude-daemon restart

# 查看状态（包含健康检查、队列、插件等摘要）
claude-daemon status

# 查看日志
claude-daemon logs         # 最后 50 行
claude-daemon logs 100     # 最后 100 行

# 开发模式（快捷脚本）
npm run dev               # daemon + Web UI
npm run dev:web           # 仅 Web UI

# 查看帮助
bun daemon/main.ts --help
```

**CLI 参数：**
- `--web, -w` - 启用 Web UI
- `--port, -p <port>` - 指定 Web UI 端口（默认：3001）
- `--help, -h` - 显示帮助信息

### 使用 Claude Code

正常使用 Claude Code，守护进程会自动记录所有会话：

```bash
echo "请帮我分析这个项目" | claude -p
```

### 查询会话历史

```bash
# 查看最近的会话
claude-sessions recent 10

# 查询特定类型
claude-sessions type coding

# 查询特定目录
claude-sessions dir /path/to/project

# 查看统计信息
claude-sessions stats
```

---

## 📐 系统架构

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
             │ 推送数据
             │ Linux/macOS: Unix Socket (/tmp/claude-daemon.sock)
             │ Windows: TCP Socket (127.0.0.1:39281)
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
└─────────────────────────────────────────┘
             ↓
┌─────────────────────────────────────────┐
│         Storage Layer                    │
│  - Raw Events (JSONL)                   │
│  - Summaries (JSON)                     │
│  - Indexes (by-type, by-directory)      │
└─────────────────────────────────────────┘
```

---

## 📂 项目结构

```
claude-daemon/
├── daemon/                        # 守护进程核心
│   ├── main.ts                   # 主入口
│   ├── hook-server.ts            # IPC 服务器
│   ├── event-queue.ts            # 事件队列
│   ├── storage-service.ts        # 存储服务
│   ├── session-analyzer.ts       # 会话分析
│   ├── scheduler.ts              # 任务调度
│   ├── health-monitor.ts         # 健康监控
│   ├── cleanup-service.ts        # 数据清理
│   ├── plugin-manager.ts         # 插件管理器
│   ├── plugin-context.ts         # 插件上下文
│   └── plugin-interface.ts       # 插件接口定义
│
├── plugins/                       # 插件目录
│   └── claude-openai-proxy/      # OpenAI Proxy 插件示例
│       ├── plugin.ts             # 插件主文件
│       ├── http-server.ts        # HTTP 服务器
│       └── process-manager.ts    # 进程管理
│
├── hooks-push/                    # 推送模式 Hooks
│   ├── SessionRecorder.hook.ts   # 会话启动
│   ├── SessionToolCapture.hook.ts # 工具调用
│   └── SessionAnalyzer.hook.ts   # 会话结束
│
├── web/                          # Web UI
│   ├── server.ts                 # Web 服务器
│   ├── api/                      # API 路由
│   └── public/                   # 前端资源
│
├── lib/                          # 共享库
│   ├── config.ts                 # 配置管理
│   ├── logger.ts                 # 日志系统
│   └── errors.ts                 # 错误处理
│
├── tools/                        # 查询工具
│   ├── SessionQuery.ts           # 会话查询
│   └── SessionStats.ts           # 统计分析
│
├── bin/                          # 可执行文件
│   └── claude-daemon             # 管理工具
│
├── systemd/                      # Linux 系统服务
│   └── claude-daemon@.service    # systemd 配置
│
├── launchd/                      # macOS 系统服务
│   └── com.claudecode.daemon.plist # launchd 配置
│
├── daemon-config.example.json    # 插件配置示例
├── install-daemon.sh             # 安装脚本
├── DAEMON-GUIDE.md               # 完整使用指南
└── README.md                     # 本文档
```

---

## 📚 文档

| 文档 | 说明 |
|------|------|
| [DAEMON-GUIDE.md](DAEMON-GUIDE.md) | 完整使用指南 |
| [DAEMON-IMPLEMENTATION.md](DAEMON-IMPLEMENTATION.md) | 实现报告 |
| [WHAT-IS-BUN.md](WHAT-IS-BUN.md) | Bun 运行时介绍 |
| [FINAL-TEST-REPORT.md](FINAL-TEST-REPORT.md) | 完整测试报告 |
| [FUNCTION-CHECK-REPORT.md](FUNCTION-CHECK-REPORT.md) | 功能检查报告 |

---

## 🔧 会话类型

系统自动识别以下会话类型：

| 类型 | 描述 | 判断依据 |
|------|------|---------|
| `coding` | 编码 | Edit/Write 操作 > 40% |
| `debugging` | 调试 | 有测试命令 + Read > Edit |
| `research` | 研究 | Grep/Glob > 30% + Read > Edit |
| `writing` | 写作 | Markdown 文件编辑 > 50% |
| `git` | Git 操作 | Git 命令 > 50% |
| `mixed` | 混合 | 无明显模式 |

---

## 🗂️ 数据存储

```
~/.claude/SESSIONS/
├── raw/                            # 原始事件流（JSONL）
│   └── 2026-01/
│       └── session-{id}.jsonl
├── analysis/
│   ├── by-type/                    # 按类型索引
│   │   ├── coding/sessions.json
│   │   ├── debugging/sessions.json
│   │   └── ...
│   ├── by-directory/               # 按目录索引
│   │   └── {base64-path}/
│   │       ├── path.txt
│   │       └── sessions.json
│   └── summaries/                  # 会话摘要
│       └── 2026-01/
│           └── summary-{id}.json
└── index/
    └── metadata.json               # 全局元数据
```

---

## ⚙️ 配置

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

---

## 🧪 测试状态

| 测试项 | 状态 |
|-------|------|
| 守护进程启动 | ✅ PASS |
| Socket 通信 | ✅ PASS |
| 事件处理 | ✅ PASS |
| 数据存储 | ✅ PASS |
| 会话分析 | ✅ PASS |
| 定时任务 | ✅ PASS |
| 健康检查 | ✅ PASS |
| 优雅关闭 | ✅ PASS |

**总计**: 12/12 通过 (100%)

详见 [完整测试报告](FINAL-TEST-REPORT.md)

---

## 🔄 从 Hook 模式迁移

如果你使用旧的 Hook 模式，升级步骤：

```bash
# 1. 备份现有配置
cp ~/.claude/settings.json ~/.claude/settings.json.backup

# 2. 运行新的安装脚本
./install-daemon.sh

# 3. 启动守护进程
claude-daemon start

# 4. 验证
claude-daemon status
```

**注意**: 守护进程模式完全向后兼容，旧数据可以继续使用。

---

## 🛠️ 故障排除

### 守护进程无法启动

```bash
# 检查 Bun 是否安装
which bun

# 查看日志
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

### 查看详细日志

```bash
# 查看最后 N 行
claude-daemon logs 200

# 或直接查看/实时监控文件
tail -f ~/.claude/daemon.log
```

更多故障排除，请查看 [DAEMON-GUIDE.md](DAEMON-GUIDE.md#故障排除)

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

---

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

---

## 🙏 致谢

- [Claude Code](https://www.anthropic.com/claude) - Anthropic 的 CLI 工具
- [Bun](https://bun.sh) - 超快的 JavaScript 运行时
- 所有贡献者

---

## 📞 联系方式

- GitHub: [@JhihJian](https://github.com/JhihJian)
- Issues: [提交问题](https://github.com/JhihJian/claude-daemon/issues)

---

<div align="center">

**⭐ 如果这个项目对你有帮助，请给个 Star！**

Made with ❤️ by [JhihJian](https://github.com/JhihJian) & [Claude Opus 4.5](https://www.anthropic.com)

</div>
