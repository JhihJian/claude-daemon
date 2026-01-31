# Claude Code 会话历史系统 - 文件清单

## 📁 目录结构

```
/data/app/claude-history/
├── README.md                    # 完整文档
├── QUICKSTART.md               # 快速开始指南 ⭐
├── SYNC-GUIDE.md               # 详细同步指南
├── FIX-REPORT.md               # 修复报告
│
├── hooks/                      # Claude Code Hooks
│   ├── SessionRecorder.hook.ts        # 会话启动记录
│   ├── SessionToolCapture-v2.hook.ts  # 工具调用记录
│   └── SessionAnalyzer.hook.ts        # 会话结束分析
│
├── tools/                      # 查询工具
│   ├── SessionQuery.ts               # 会话查询
│   ├── SessionStats.ts               # 统计分析
│   └── show-conversation.sh          # 友好显示 ⭐
│
├── install.sh                  # 一键安装脚本 ⭐
├── setup-git.sh               # Git 仓库初始化
├── setup-auto-sync.sh         # 自动同步设置
├── sync-git.sh                # Git 同步脚本
└── package.sh                 # 打包脚本
```

## 🎯 使用流程

### 首次安装（当前电脑）
```bash
cd /data/app/claude-history
./install.sh
```

### 部署到其他电脑

#### 方式 1: 打包传输
```bash
# 电脑 A
./package.sh
scp claude-history-system-*.tar.gz user@computer-b:/tmp/

# 电脑 B
cd /tmp && tar -xzf claude-history-system-*.tar.gz
cd claude-history && ./install.sh
```

#### 方式 2: Git 克隆
```bash
git clone <仓库> /data/app/claude-history
cd /data/app/claude-history
./install.sh
```

### 设置数据同步

#### Git 同步（推荐）
```bash
# 1. 初始化（电脑 A）
./setup-git.sh

# 2. 设置自动同步
./setup-auto-sync.sh

# 3. 克隆到其他电脑（电脑 B）
git clone <仓库> ~/.claude/SESSIONS
```

#### 云存储同步
```bash
mv ~/.claude/SESSIONS ~/Dropbox/claude-sessions
ln -s ~/Dropbox/claude-sessions ~/.claude/SESSIONS
```

## 📝 核心功能

### 记录内容
- ✅ 工作目录和 Git 信息
- ✅ 用户问题
- ✅ Claude 回答
- ✅ 工具调用和结果
- ✅ 成功率统计

### 查询功能
```bash
# 最近会话
claude-sessions recent 5

# 按类型查询
claude-sessions type coding

# 查看详情（包含完整对话）
claude-sessions show <session_id>

# 统计信息
claude-sessions stats global
```

### 会话分类
- `coding` - 编码
- `debugging` - 调试
- `research` - 研究
- `writing` - 写作
- `git` - Git 操作
- `mixed` - 混合

## 🔧 关键改进

### v1.0 (2026-01-24)

1. **修复 Hooks 执行问题**
   - 使用 Bun 完整路径
   - 解决 PATH 问题

2. **正确捕获工具输出**
   - 从 `tool_response.stdout` 读取
   - 正确判断成功状态

3. **添加对话内容记录** ⭐
   - 记录用户问题
   - 记录 Claude 回答
   - 从 transcript 提取

4. **多设备支持**
   - 一键安装脚本
   - Git 同步方案
   - 自动同步设置

## 🎓 示例输出

### 查询会话
```json
{
  "session_id": "04291516-...",
  "session_type": "mixed",
  "conversation": {
    "user_messages": ["今天是星期几"],
    "assistant_responses": ["今天是 2026年1月24日，是**星期六**。"],
    "message_count": 2
  },
  "success_rate": 100
}
```

### 友好显示
```
========================================
💬 对话内容
========================================

👤 用户: 今天是星期几

🤖 Claude: 今天是 2026年1月24日，是**星期六**。

========================================
🔧 工具使用
========================================

没有使用工具
```

## 📊 数据存储

```
~/.claude/SESSIONS/
├── raw/                        # 原始事件（JSONL）
│   └── 2026-01/
│       └── session-{id}.jsonl
├── analysis/
│   ├── summaries/              # 会话摘要（包含对话）
│   │   └── 2026-01/
│   │       └── summary-{id}.json
│   ├── by-type/                # 按类型索引
│   └── by-directory/           # 按目录索引
└── index/
    └── metadata.json           # 全局统计
```

## ⚠️ 注意事项

### 数据隐私
- 使用私有仓库
- 不提交敏感信息
- 定期清理旧数据

### 性能
- JSONL 格式，流式写入
- Hook 执行时间 < 50ms
- 不阻塞 Claude Code

### 冲突处理
- Git 自动合并 JSONL 文件
- 按主机名分目录（可选）
- 冲突解决脚本

## 🔗 相关资源

- Claude Code 文档: https://docs.anthropic.com/claude/docs/claude-code
- Git 教程: https://git-scm.com/docs
- Syncthing: https://syncthing.net/

---

**维护者**: Claude Code 会话历史系统
**版本**: v1.0
**日期**: 2026-01-24
