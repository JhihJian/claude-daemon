# Claude Code 会话历史系统 - 快速开始

## 🚀 在当前电脑上使用

系统已经安装并运行！

### 查询会话

```bash
# 查看最近的会话
~/.bun/bin/bun /data/app/claude-history/tools/SessionQuery.ts recent 5

# 查看会话详情（包含完整对话）
/data/app/claude-history/tools/show-conversation.sh <session_id>

# 查看统计信息
~/.bun/bin/bun /data/app/claude-history/tools/SessionStats.ts global
```

---

## 📦 部署到其他电脑

### 方法 1: 打包传输（最简单）

**在当前电脑上：**
```bash
cd /data/app
./claude-history/package.sh
# 生成: claude-history-system-YYYYMMDD.tar.gz
```

**传输到目标电脑：**
```bash
scp claude-history-system-*.tar.gz user@target:/tmp/
```

**在目标电脑上：**
```bash
cd /tmp
tar -xzf claude-history-system-*.tar.gz
cd claude-history
./install.sh
```

### 方法 2: Git 克隆

**在目标电脑上：**
```bash
git clone <你的仓库地址> /data/app/claude-history
cd /data/app/claude-history
./install.sh
```

---

## 🔄 数据同步设置

### 选项 A: Git 同步（推荐）

**1. 初始化 Git 仓库（在第一台电脑上）：**
```bash
cd /data/app/claude-history
./setup-git.sh
```

按提示操作：
- 选择 GitHub/GitLab
- 输入用户名
- 创建私有仓库

**2. 设置自动同步：**
```bash
./setup-auto-sync.sh
```

选择同步频率（推荐：每小时）

**3. 在其他电脑上克隆数据：**
```bash
# 先安装系统
cd /tmp && tar -xzf claude-history-system-*.tar.gz
cd claude-history && ./install.sh

# 克隆会话数据
git clone git@github.com:你的用户名/claude-sessions.git ~/.claude/SESSIONS

# 设置自动同步
cd /data/app/claude-history
./setup-auto-sync.sh
```

### 选项 B: 云存储同步

**使用 Dropbox/Google Drive：**
```bash
# 移动数据到云存储
mv ~/.claude/SESSIONS ~/Dropbox/claude-sessions

# 创建符号链接
ln -s ~/Dropbox/claude-sessions ~/.claude/SESSIONS
```

在其他电脑上重复相同操作。

---

## 🔍 验证安装

```bash
# 1. 测试会话记录
echo "测试会话记录" | claude -p

# 2. 等待几秒
sleep 3

# 3. 查询最新会话
~/.bun/bin/bun /data/app/claude-history/tools/SessionQuery.ts recent 1

# 4. 查看对话内容
~/.bun/bin/bun /data/app/claude-history/tools/SessionQuery.ts recent 1 | \
  jq -r '.[0].session_id' | \
  xargs /data/app/claude-history/tools/show-conversation.sh
```

---

## 📊 常用命令

```bash
# 查询
claude-sessions recent 10              # 最近10个会话
claude-sessions type coding            # 编码类会话
claude-sessions stats global           # 全局统计
claude-sessions show <session_id>      # 会话详情

# 同步（如果使用 Git）
cd ~/.claude/SESSIONS && git pull      # 拉取更新
cd ~/.claude/SESSIONS && git push      # 推送更新
/data/app/claude-history/sync-git.sh   # 自动同步

# 日志
tail -f ~/.claude/sync.log             # 查看同步日志
```

---

## ⚠️ 重要提示

### 数据隐私
- ✅ 使用**私有仓库**存储会话数据
- ✅ 不要提交包含敏感信息的会话
- ✅ 定期清理旧数据

### 冲突处理
如果多台电脑同时工作导致冲突：
```bash
cd ~/.claude/SESSIONS
git pull --rebase
# 如果有冲突，sync-git.sh 会自动合并 JSONL 文件
```

### 性能优化
```bash
# 归档旧数据（3个月前）
find ~/.claude/SESSIONS/raw -type f -mtime +90 -exec gzip {} \;
```

---

## 🆘 故障排除

### Hooks 不工作
```bash
# 检查 hooks 权限
ls -la ~/.claude/hooks/

# 手动测试 hook
echo '{"session_id":"test"}' | ~/.claude/hooks/SessionRecorder.hook.ts
```

### 同步失败
```bash
# 查看同步日志
tail -50 ~/.claude/sync.log

# 手动同步
cd ~/.claude/SESSIONS
git status
git pull
git push
```

### 查询工具找不到
```bash
# 重新加载 shell 配置
source ~/.zshrc  # 或 ~/.bashrc

# 检查 PATH
echo $PATH | grep "$HOME/bin"
```

---

## 📚 更多信息

- 完整文档: `/data/app/claude-history/README.md`
- 同步指南: `/data/app/claude-history/SYNC-GUIDE.md`
- 故障排除: `/data/app/claude-history/README.md#故障排除`

---

**系统版本**: v1.0
**最后更新**: 2026-01-24
