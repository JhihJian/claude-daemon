# Claude Code 会话历史系统 - Windows 安装指南

## Windows 支持方案

Windows 用户有三种方式使用本系统：

### 🎯 方案对比

| 方案 | 难度 | 兼容性 | 推荐度 |
|------|------|--------|--------|
| **WSL2** | 简单 | 完美 | ⭐⭐⭐⭐⭐ |
| **Git Bash** | 简单 | 良好 | ⭐⭐⭐⭐ |
| **PowerShell** | 中等 | 原生 | ⭐⭐⭐ |

---

## 方案 1: WSL2（推荐）✨

### 为什么推荐 WSL2？
- ✅ 完全兼容 Linux 脚本
- ✅ Claude Code 可以在 WSL 中运行
- ✅ 所有功能都能正常工作
- ✅ 性能好

### 安装步骤

#### 1. 安装 WSL2

**在 PowerShell（管理员）中运行：**
```powershell
wsl --install
```

重启电脑后，WSL2 会自动安装 Ubuntu。

#### 2. 在 WSL 中安装系统

**打开 WSL 终端：**
```bash
# 1. 传输安装包到 WSL
# 在 Windows 中，文件位于: \\wsl$\Ubuntu\home\你的用户名\

# 2. 解压并安装
cd ~
tar -xzf claude-history-system-*.tar.gz
cd claude-history
./install.sh
```

#### 3. 配置 Claude Code 使用 WSL

**在 Windows 中，编辑 Claude Code 配置：**
```
C:\Users\你的用户名\.claude\settings.json
```

Claude Code 会自动检测 WSL 环境。

#### 4. 数据位置

WSL 中的数据在 Windows 中的位置：
```
\\wsl$\Ubuntu\home\你的用户名\.claude\SESSIONS
```

你可以在 Windows 文件资源管理器中访问这个路径。

---

## 方案 2: Git Bash

### 安装步骤

#### 1. 安装 Git for Windows

下载并安装：https://git-scm.com/download/win

安装时选择 "Git Bash Here"。

#### 2. 安装 Bun

**在 Git Bash 中运行：**
```bash
curl -fsSL https://bun.sh/install | bash
```

#### 3. 安装会话历史系统

```bash
cd /c/Users/你的用户名/
tar -xzf claude-history-system-*.tar.gz
cd claude-history
./install.sh
```

#### 4. 路径转换

Git Bash 使用 Unix 风格路径：
- Windows: `C:\Users\用户名`
- Git Bash: `/c/Users/用户名`

---

## 方案 3: PowerShell（原生 Windows）

我为你创建了 PowerShell 版本的脚本。

### 文件清单

- `install.ps1` - 安装脚本
- `sync-git.ps1` - Git 同步脚本
- `setup-git.ps1` - Git 初始化脚本

### 使用方法

**在 PowerShell（管理员）中运行：**
```powershell
# 1. 允许运行脚本
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser

# 2. 进入安装目录
cd C:\Users\你的用户名\Downloads\claude-history

# 3. 运行安装
.\install.ps1
```

---

## 数据同步（Windows）

### Git 同步

**WSL/Git Bash:**
```bash
cd ~/.claude/SESSIONS
git pull && git add . && git commit -m "sync" && git push
```

**PowerShell:**
```powershell
cd $env:USERPROFILE\.claude\SESSIONS
git pull
git add .
git commit -m "sync from $(hostname)"
git push
```

### 云存储同步

#### OneDrive（推荐）
```powershell
# 移动数据到 OneDrive
Move-Item $env:USERPROFILE\.claude\SESSIONS $env:OneDrive\claude-sessions

# 创建符号链接（需要管理员权限）
New-Item -ItemType SymbolicLink `
  -Path $env:USERPROFILE\.claude\SESSIONS `
  -Target $env:OneDrive\claude-sessions
```

#### Dropbox
```powershell
Move-Item $env:USERPROFILE\.claude\SESSIONS $env:USERPROFILE\Dropbox\claude-sessions
New-Item -ItemType SymbolicLink `
  -Path $env:USERPROFILE\.claude\SESSIONS `
  -Target $env:USERPROFILE\Dropbox\claude-sessions
```

---

## 自动同步（Windows）

### 使用任务计划程序

#### 1. 创建同步脚本

**保存为 `sync-sessions.ps1`:**
```powershell
cd $env:USERPROFILE\.claude\SESSIONS
git pull
git add .
git commit -m "Auto-sync from $(hostname) - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
git push
```

#### 2. 创建计划任务

**在 PowerShell（管理员）中运行：**
```powershell
$action = New-ScheduledTaskAction `
  -Execute "PowerShell.exe" `
  -Argument "-File C:\Users\你的用户名\sync-sessions.ps1"

$trigger = New-ScheduledTaskTrigger -Daily -At 9am

Register-ScheduledTask `
  -TaskName "Claude Sessions Sync" `
  -Action $action `
  -Trigger $trigger `
  -Description "自动同步 Claude 会话历史"
```

---

## 路径对照表

| 系统 | Claude 配置 | 会话数据 |
|------|------------|---------|
| **Linux/macOS** | `~/.claude/` | `~/.claude/SESSIONS/` |
| **Windows (原生)** | `C:\Users\用户名\.claude\` | `C:\Users\用户名\.claude\SESSIONS\` |
| **WSL** | `/home/用户名/.claude/` | `/home/用户名/.claude/SESSIONS/` |
| **Git Bash** | `/c/Users/用户名/.claude/` | `/c/Users/用户名/.claude/SESSIONS/` |

---

## 常见问题

### Q: Claude Code 在 Windows 上找不到 hooks？

**A:** 检查 `settings.json` 中的路径格式：

```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "C:\\Users\\用户名\\.claude\\hooks\\SessionRecorder.hook.ts"
      }]
    }]
  }
}
```

注意：Windows 路径使用双反斜杠 `\\`。

### Q: Bun 在 Windows 上不工作？

**A:** 确保使用 Bun 的 Windows 版本：
```powershell
irm bun.sh/install.ps1 | iex
```

### Q: 符号链接创建失败？

**A:** 需要管理员权限。右键点击 PowerShell，选择"以管理员身份运行"。

---

## 推荐配置

### 个人使用（单台 Windows 电脑）
- 使用 **WSL2** 或 **Git Bash**
- 数据存储在本地
- 定期备份到云存储

### 多设备（Windows + Mac/Linux）
- 使用 **WSL2**（Windows）
- 使用 **Git 同步**
- 所有设备共享同一个 Git 仓库

### 企业环境
- 使用 **PowerShell** 脚本
- 使用 **OneDrive** 或企业网盘同步
- 配置任务计划程序自动同步

---

## 下一步

选择你的方案后：

1. **WSL2**: 查看 `QUICKSTART.md`（所有 Linux 命令都适用）
2. **Git Bash**: 查看 `QUICKSTART.md`（大部分命令适用）
3. **PowerShell**: 查看下一节的 PowerShell 脚本

---

**提示**: 我推荐使用 WSL2，因为它提供最好的兼容性和性能。
