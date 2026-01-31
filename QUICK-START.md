# Claude Daemon 快速开始指南

## 🚀 当前状态

✅ **系统已启动并运行**
- Web UI: http://127.0.0.1:3001
- IPC 服务: 127.0.0.1:39281 (Windows TCP Socket)
- 守护进程: 正常运行
- 已记录会话: 133 个

---

## 📊 立即使用

### 1. 访问 Web UI

在浏览器中打开：
```
http://127.0.0.1:3001
```

您可以看到：
- 📈 实时会话统计
- 📝 会话历史记录
- 🔍 按类型/目录筛选
- 📊 工具使用分析

### 2. 自动记录

**无需任何操作！** 守护进程会自动记录所有 Claude Code 会话：
- ✅ 会话开始/结束时间
- ✅ 使用的工具和命令
- ✅ 修改的文件
- ✅ Git 信息（仓库、分支）
- ✅ 会话类型分类（coding, debugging, research 等）

### 3. 查询会话

#### 通过 Web UI（推荐）
直接在浏览器中浏览和搜索

#### 通过 API
```bash
# 查看最近 10 个会话
curl http://127.0.0.1:3001/api/sessions/recent?limit=10

# 按类型查询
curl http://127.0.0.1:3001/api/sessions/by-type?type=coding

# 查看统计信息
curl http://127.0.0.1:3001/api/stats/global
```

---

## 🎮 常用命令

### 查看系统状态
```bash
# 健康检查
curl http://127.0.0.1:3001/api/health

# 查看端口占用
netstat -ano | findstr "3001\|39281"
```

### 管理守护进程
```bash
# 停止守护进程
# 1. 找到 PID
netstat -ano | findstr "3001"
# 2. 终止进程
taskkill /PID <PID> /F

# 重新启动
bun daemon/main.ts --enable-web-ui --port 3001
```

### 查看日志
```powershell
# PowerShell
Get-Content -Tail 50 -Wait $env:USERPROFILE\.claude\daemon.log
```

---

## 📁 数据存储位置

所有数据存储在 `%USERPROFILE%\.claude\` 目录下：

```
%USERPROFILE%\.claude\
├── SESSIONS\
│   ├── raw\                    # 原始事件（JSONL）
│   │   └── 2026-01\
│   │       └── session-*.jsonl
│   └── analysis\               # 分析结果
│       ├── summaries\          # 会话摘要（JSON）
│       ├── by-type\            # 按类型索引
│       └── by-directory\       # 按目录索引
└── daemon.log                  # 守护进程日志
```

---

## 🔍 会话类型说明

系统会自动将会话分类为：

- **coding** - 编码会话（Edit/Write 工具 > 40%）
- **debugging** - 调试会话（有测试命令 + Read > Edit）
- **research** - 研究会话（Grep/Glob 工具 > 30%）
- **writing** - 写作会话（Markdown 编辑 > 50%）
- **git** - Git 操作会话（Git 命令 > 50%）
- **mixed** - 混合类型会话

---

## 🎯 实用场景

### 场景 1: 回顾工作历史
在 Web UI 中查看过去的会话，了解在某个项目上做了什么

### 场景 2: 分析工具使用
查看统计信息，了解最常用的工具和命令

### 场景 3: 项目追踪
按目录筛选，查看特定项目的所有会话历史

### 场景 4: 学习和改进
分析成功率和工具使用模式，优化工作流程

---

## ⚡ 性能指标

当前系统性能：
- Hook 执行时间: < 100ms
- API 响应时间: < 50ms
- 内存占用: ~50MB
- CPU 占用: < 1%（空闲时）

---

## 🆘 故障排查

### 问题：Web UI 无法访问
```bash
# 检查守护进程是否运行
curl http://127.0.0.1:3001/api/health

# 检查端口是否被占用
netstat -ano | findstr "3001"
```

### 问题：会话没有被记录
```bash
# 检查 IPC 服务是否运行
netstat -ano | findstr "39281"

# 查看守护进程日志
Get-Content -Tail 50 $env:USERPROFILE\.claude\daemon.log
```

### 问题：Hook 报错
```bash
# 测试 Hook 连接
echo '{"session_id":"test","event_type":"session_start"}' | bun hooks-push/SessionRecorder.hook.ts

# 应该返回: {"continue":true}
```

---

## 📚 更多信息

- 完整文档: [CLAUDE.md](./CLAUDE.md)
- 测试报告: [COMPREHENSIVE-TESTING-COMPLETE.md](./COMPREHENSIVE-TESTING-COMPLETE.md)
- 更新日志: [CHANGELOG.md](./CHANGELOG.md)
- Windows 支持: [BUG-002-IMPLEMENTATION.md](./BUG-002-IMPLEMENTATION.md)

---

## 🎉 开始使用

现在就打开浏览器访问：
```
http://127.0.0.1:3001
```

享受自动化的会话记录和分析！

---

**版本**: v1.3.4
**平台**: Windows, Linux, macOS
**状态**: ✅ 生产就绪
