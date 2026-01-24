# Claude Code 会话历史记录系统

> 自动记录、分类和分析 Claude Code 会话历史

## 功能特性

- ✅ **自动记录**：捕获每个会话的启动目录、Git 信息、工具调用
- ✅ **智能分类**：自动识别会话类型（编码、调试、研究、写作、Git 操作等）
- ✅ **多维索引**：按类型、按目录、按时间快速查询
- ✅ **统计分析**：会话统计、类型分布、活跃目录分析
- ✅ **JSONL 存储**：流式写入，易于解析和处理

## 目录结构

```
/data/app/claude-history/
├── hooks/                          # Claude Code Hooks
│   ├── SessionRecorder.hook.ts     # 会话启动时记录
│   ├── SessionToolCapture.hook.ts  # 工具调用时记录
│   └── SessionAnalyzer.hook.ts     # 会话结束时分析
├── tools/                          # 查询工具
│   ├── SessionQuery.ts             # 会话查询
│   └── SessionStats.ts             # 统计分析
├── lib/                            # 共享库（预留）
└── test/                           # 测试脚本（预留）
```

## 数据存储结构

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

## 快速开始

### 1. 安装 Hooks

将 hooks 注册到 Claude Code：

```bash
# 假设 PAI_DIR=~/.claude
cp hooks/*.hook.ts ~/.claude/hooks/

# 或者创建符号链接
ln -s /data/app/claude-history/hooks/*.hook.ts ~/.claude/hooks/
```

### 2. 配置 Hook 触发器

在 `~/.claude/settings.json` 中添加：

```json
{
  "hooks": {
    "SessionStart": ["SessionRecorder.hook.ts"],
    "PostToolUse": ["SessionToolCapture.hook.ts"],
    "Stop": ["SessionAnalyzer.hook.ts"]
  }
}
```

### 3. 使用查询工具

```bash
# 查询最近的会话
bun /data/app/claude-history/tools/SessionQuery.ts recent 10

# 查询编码类会话
bun /data/app/claude-history/tools/SessionQuery.ts type coding

# 查询特定目录的会话
bun /data/app/claude-history/tools/SessionQuery.ts dir /path/to/project

# 查看统计信息
bun /data/app/claude-history/tools/SessionStats.ts global
bun /data/app/claude-history/tools/SessionStats.ts types
bun /data/app/claude-history/tools/SessionStats.ts dirs 10
```

## 会话类型

系统自动识别以下会话类型：

| 类型 | 描述 | 判断依据 |
|------|------|---------|
| `coding` | 编码 | Edit/Write 操作 > 40% |
| `debugging` | 调试 | 有测试命令 + Read > Edit |
| `research` | 研究 | Grep/Glob > 30% + Read > Edit |
| `writing` | 写作 | Markdown 文件编辑 > 50% |
| `git` | Git 操作 | Git 命令 > 50% |
| `mixed` | 混合 | 无明显模式 |

## 技术细节

- **运行时**：Bun
- **存储格式**：JSONL（每行一个 JSON 对象）
- **索引策略**：增量更新，按时间倒序
- **路径编码**：Base64（避免文件系统特殊字符）
- **性能**：Hook 执行时间 < 50ms，不阻塞 Claude Code

## 开发

```bash
# 测试 Hook
echo '{"session_id":"test123","timestamp":"2026-01-23T10:00:00Z"}' | \
  bun hooks/SessionRecorder.hook.ts

# 测试查询
bun tools/SessionQuery.ts recent 5

# 测试统计
bun tools/SessionStats.ts global
```

## 故障排除

### Hooks 不执行

**问题**: Hooks 配置正确但不记录数据

**原因**: Hook 脚本的 shebang 使用 `#!/usr/bin/env bun`，但 Claude Code 执行 hooks 时 `~/.bun/bin` 不在 PATH 中

**解决方案**: 使用 Bun 的完整路径
```bash
# 修改所有 hook 文件的第一行
#!/home/jhihjian/.bun/bin/bun
```

### 工具输出为空或 success_rate 为 0

**问题**: 会话记录显示 `tool_output: ""` 和 `success: false`

**原因**: 早期版本的 SessionToolCapture hook 没有正确读取 PostToolUse 事件中的 `tool_response` 字段

**解决方案**: 使用最新版本的 SessionToolCapture-v2.hook.ts，它会：
1. 优先从 `event.tool_response.stdout/stderr` 读取输出
2. 从 `!event.tool_response.interrupted` 判断成功状态
3. 备用方案：从 transcript 文件读取

### 验证 Hooks 是否工作

```bash
# 1. 手动测试 hook
echo '{"session_id":"test","tool_name":"Bash"}' | ~/.bun/bin/bun ~/.claude/hooks/SessionRecorder.hook.ts

# 2. 运行测试会话
echo "请运行 date 命令" | claude -p --dangerously-skip-permissions

# 3. 检查会话文件
ls -lt ~/.claude/SESSIONS/raw/2026-01/ | head -3
cat ~/.claude/SESSIONS/raw/2026-01/session-*.jsonl | tail -1 | jq '.'
```

## 许可证

MIT
