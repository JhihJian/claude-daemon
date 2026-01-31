# Claude Code 会话历史系统 - 多设备部署与同步方案

## 概述

本文档描述如何在多台电脑之间部署和同步 Claude Code 会话历史记录系统。

## 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    Git 仓库 (中央存储)                         │
│              github.com/你的用户名/claude-history             │
└─────────────────────────────────────────────────────────────┘
                              ↕
        ┌────────────────────────────────────────┐
        │                同步                      │
        ↕                                          ↕
┌───────────────┐                          ┌───────────────┐
│   电脑 A      │                          │   电脑 B      │
│               │                          │               │
│ ~/.claude/    │                          │ ~/.claude/    │
│   SESSIONS/   │                          │   SESSIONS/   │
│   ├─ raw/     │                          │   ├─ raw/     │
│   └─ analysis/│                          │   └─ analysis/│
└───────────────┘                          └───────────────┘
```

## 部署策略

### 策略 1: Git 同步（推荐用于个人）

**优点**:
- ✅ 简单易用
- ✅ 版本控制
- ✅ 可以查看历史变更
- ✅ 离线工作

**缺点**:
- ⚠️ 需要手动或定时同步
- ⚠️ 可能有合并冲突

**适用场景**: 2-3 台个人电脑，不需要实时同步

### 策略 2: 云存储同步（推荐用于多设备）

**优点**:
- ✅ 自动同步
- ✅ 实时更新
- ✅ 无需手动操作

**缺点**:
- ⚠️ 需要云存储服务
- ⚠️ 可能有冲突

**适用场景**: 多台设备，需要近实时同步

支持的云存储:
- Dropbox
- Google Drive
- iCloud Drive
- OneDrive
- Syncthing (开源，自托管)

### 策略 3: 远程数据库（企业级）

**优点**:
- ✅ 真正的实时同步
- ✅ 多用户支持
- ✅ 高级查询能力

**缺点**:
- ⚠️ 需要搭建服务器
- ⚠️ 更复杂

**适用场景**: 团队使用，需要共享会话历史

## 实施方案

---

## 方案 1: Git 同步（详细步骤）

### 1.1 初始设置（在第一台电脑上）

```bash
# 1. 进入会话数据目录
cd ~/.claude/SESSIONS

# 2. 初始化 Git 仓库
git init
git add .
git commit -m "Initial session history"

# 3. 创建远程仓库（GitHub/GitLab）
# 在 GitHub 上创建私有仓库: claude-sessions

# 4. 推送到远程
git remote add origin git@github.com:你的用户名/claude-sessions.git
git branch -M main
git push -u origin main
```

### 1.2 在其他电脑上设置

```bash
# 1. 备份现有数据（如果有）
mv ~/.claude/SESSIONS ~/.claude/SESSIONS.backup

# 2. 克隆仓库
git clone git@github.com:你的用户名/claude-sessions.git ~/.claude/SESSIONS

# 3. 设置 hooks（安装会话记录系统）
cd /path/to/claude-history
./install.sh  # 我们需要创建这个安装脚本
```

### 1.3 同步工作流

#### 手动同步
```bash
# 拉取最新数据
cd ~/.claude/SESSIONS
git pull

# 使用 Claude Code...

# 推送新数据
git add .
git commit -m "Sessions from $(hostname) - $(date +%Y-%m-%d)"
git push
```

#### 自动同步（推荐）
```bash
# 创建自动同步脚本
cat > ~/.claude/sync-sessions.sh << 'EOF'
#!/bin/bash
cd ~/.claude/SESSIONS

# 拉取远程更新
git fetch origin

# 合并（使用策略合并避免冲突）
git merge origin/main --strategy-option theirs

# 提交本地更改
git add .
git commit -m "Auto-sync from $(hostname) - $(date +%Y-%m-%d_%H:%M:%S)" || true

# 推送
git push origin main
EOF

chmod +x ~/.claude/sync-sessions.sh

# 添加到 crontab（每小时同步一次）
(crontab -l 2>/dev/null; echo "0 * * * * ~/.claude/sync-sessions.sh >> ~/.claude/sync.log 2>&1") | crontab -
```

---

## 方案 2: 云存储同步

### 2.1 使用 Dropbox/Google Drive

```bash
# 1. 移动 SESSIONS 到云存储
mv ~/.claude/SESSIONS ~/Dropbox/claude-sessions

# 2. 创建符号链接
ln -s ~/Dropbox/claude-sessions ~/.claude/SESSIONS
```

### 2.2 使用 Syncthing（开源方案）

```bash
# 1. 安装 Syncthing
# Ubuntu/Debian:
sudo apt install syncthing

# macOS:
brew install syncthing

# 2. 启动 Syncthing
syncthing

# 3. 打开 Web UI（http://localhost:8384）
# 4. 添加 ~/.claude/SESSIONS 为同步文件夹
# 5. 在其他设备上重复此过程并配对
```

---

## 方案 3: 集中式安装（简化版）

### 3.1 创建安装包

将整个系统打包成一个可移植的包：

```bash
# 在源电脑上
cd /data/app
tar -czf claude-history-system.tar.gz claude-history/

# 传输到目标电脑
scp claude-history-system.tar.gz user@target-computer:/tmp/
```

### 3.2 一键安装脚本

我们需要创建一个安装脚本，让其他电脑也能快速部署。

---

## 数据隐私和安全

### 重要提示

⚠️ **会话数据可能包含敏感信息**：
- 代码片段
- API密钥（如果在对话中提到）
- 项目路径
- 个人对话内容

### 安全建议

1. **使用私有仓库**
   ```bash
   # GitHub 创建私有仓库
   gh repo create claude-sessions --private
   ```

2. **加密敏感数据**
   ```bash
   # 使用 git-crypt 加密
   cd ~/.claude/SESSIONS
   git-crypt init
   echo "*.jsonl filter=git-crypt diff=git-crypt" > .gitattributes
   git-crypt add-gpg-user your-gpg-key
   ```

3. **使用 .gitignore 排除敏感文件**
   ```bash
   cat > ~/.claude/SESSIONS/.gitignore << 'EOF'
   # 排除可能包含密钥的会话
   **/session-*-sensitive.jsonl

   # 排除临时文件
   *.tmp
   *.log
   EOF
   ```

4. **定期清理旧数据**
   ```bash
   # 删除3个月前的会话
   find ~/.claude/SESSIONS/raw -type f -mtime +90 -delete
   ```

---

## 冲突处理

### Git 合并冲突

不同电脑同时工作可能产生冲突。解决方案：

#### 策略 1: 按机器名分目录
```bash
# 修改 SessionRecorder.hook.ts
const hostname = require('os').hostname();
const sessionFile = join(
  paiDir,
  'SESSIONS/raw',
  hostname,  // 按主机名分目录
  yearMonth,
  `session-${sessionId}.jsonl`
);
```

#### 策略 2: 使用时间戳
```bash
# 会话文件名包含主机名和时间戳
const sessionFile = `session-${hostname}-${timestamp}-${sessionId}.jsonl`;
```

#### 策略 3: 自动合并脚本
```bash
cat > ~/.claude/resolve-conflicts.sh << 'EOF'
#!/bin/bash
cd ~/.claude/SESSIONS

# 检查冲突
if git diff --name-only --diff-filter=U | grep -q .; then
  echo "检测到冲突，自动合并..."

  # 对于 JSONL 文件，两边都保留
  git diff --name-only --diff-filter=U | while read file; do
    git show :2:$file > /tmp/ours.jsonl
    git show :3:$file > /tmp/theirs.jsonl
    cat /tmp/ours.jsonl /tmp/theirs.jsonl > $file
    git add $file
  done

  git commit -m "Auto-resolved conflicts"
fi
EOF
```

---

## 性能优化

### 大数据量处理

随着时间推移，会话数据会变得很大。优化方案：

#### 1. 定期归档
```bash
# 归档旧数据
cd ~/.claude/SESSIONS/raw
tar -czf archive-2026-01.tar.gz 2026-01/
rm -rf 2026-01/
```

#### 2. 使用 Git LFS
```bash
# 安装 Git LFS
git lfs install

# 追踪大文件
cd ~/.claude/SESSIONS
git lfs track "*.jsonl"
git add .gitattributes
git commit -m "Enable Git LFS"
```

#### 3. 浅克隆
```bash
# 只克隆最近的提交
git clone --depth 1 git@github.com:你的用户名/claude-sessions.git
```

---

## 总结：推荐方案

### 个人使用（2-3台电脑）

**推荐**: Git + 自动同步脚本

```bash
# 每台电脑上执行
cd ~/.claude/SESSIONS
git init
git remote add origin git@github.com:你的用户名/claude-sessions.git

# 设置自动同步（每小时）
crontab -e
# 添加: 0 * * * * cd ~/.claude/SESSIONS && git pull && git add . && git commit -m "sync" && git push
```

### 多设备实时同步

**推荐**: Syncthing

- 开源免费
- 点对点同步
- 无需中央服务器
- 自动冲突解决

### 团队使用

**推荐**: 集中式数据库 + API

- PostgreSQL 存储会话数据
- REST API 提供查询
- 每台电脑的 hooks 通过 API 提交数据

---

## 下一步

我将为你创建：

1. ✅ 一键安装脚本 (`install.sh`)
2. ✅ 自动同步脚本（Git 方案）
3. ✅ 配置模板
4. ✅ 数据迁移工具

你希望先实现哪个方案？
