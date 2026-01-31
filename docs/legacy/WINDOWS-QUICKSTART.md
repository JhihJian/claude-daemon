# Windows 快速开始指南

## 🎯 推荐方案

**最佳选择**: WSL2 + Linux 脚本（完美兼容）
**备选方案**: PowerShell 脚本（原生 Windows）

---

## 方案 A: WSL2（推荐）⭐⭐⭐⭐⭐

### 1. 安装 WSL2

**PowerShell（管理员）：**
```powershell
wsl --install
```

重启电脑。

### 2. 传输安装包到 WSL

**方法 1: 直接访问**
在 Windows 中，打开 `\\wsl$\Ubuntu\home\你的用户名\`，将安装包复制进去。

**方法 2: 命令行**
```bash
# 在 WSL 中
cp /mnt/c/Users/你的用户名/Downloads/claude-history-system-*.tar.gz ~/
```

### 3. 安装

**在 WSL 终端中：**
```bash
cd ~
tar -xzf claude-history-system-*.tar.gz
cd claude-history
./install.sh
```

### 4. 使用

完全按照 Linux 的方式使用，所有命令都一样！

**查询会话：**
```bash
~/.bun/bin/bun ~/claude-history/tools/SessionQuery.ts recent 5
```

### 5. 访问数据（从 Windows）

在 Windows 文件资源管理器中访问：
```
\\wsl$\Ubuntu\home\你的用户名\.claude\SESSIONS
```

---

## 方案 B: PowerShell（原生 Windows）⭐⭐⭐

### 1. 解压安装包

**在 Downloads 文件夹中：**
```powershell
Expand-Archive claude-history-system-*.zip -DestinationPath .
cd claude-history
```

### 2. 允许运行脚本

**PowerShell（管理员）：**
```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### 3. 安装

```powershell
.\install.ps1
```

### 4. 使用

**查询会话：**
```powershell
# 方法 1: 使用包装脚本
PowerShell -File $env:USERPROFILE\bin\claude-sessions.ps1 recent 5

# 方法 2: 直接使用 Bun
bun C:\path\to\claude-history\tools\SessionQuery.ts recent 5
```

**查看统计：**
```powershell
bun C:\path\to\claude-history\tools\SessionStats.ts global
```

---

## Git 同步设置

### WSL2

在 WSL 中完全按照 Linux 方式：

```bash
cd ~/claude-history
./setup-git.sh
./setup-auto-sync.sh
```

### PowerShell

```powershell
# 1. 初始化 Git
cd $env:USERPROFILE\.claude\SESSIONS
.\setup-git.ps1

# 2. 手动同步
.\sync-git.ps1

# 3. 设置计划任务（自动同步）
$action = New-ScheduledTaskAction `
  -Execute "PowerShell.exe" `
  -Argument "-File $env:USERPROFILE\claude-history\sync-git.ps1"

$trigger = New-ScheduledTaskTrigger -Daily -At 9am

Register-ScheduledTask `
  -TaskName "Claude Sessions Sync" `
  -Action $action `
  -Trigger $trigger
```

---

## 云存储同步（OneDrive）

### 使用符号链接

**PowerShell（管理员）：**
```powershell
# 1. 移动数据到 OneDrive
Move-Item $env:USERPROFILE\.claude\SESSIONS `
  $env:OneDrive\claude-sessions

# 2. 创建符号链接
New-Item -ItemType SymbolicLink `
  -Path $env:USERPROFILE\.claude\SESSIONS `
  -Target $env:OneDrive\claude-sessions
```

在其他 Windows 电脑上重复相同操作。

---

## 跨平台同步（Windows + Mac/Linux）

### 方案：Git 仓库

**在 Windows（WSL）：**
```bash
cd ~/.claude/SESSIONS
git init
git remote add origin git@github.com:你的用户名/claude-sessions.git
git add .
git commit -m "Initial commit"
git push -u origin main
```

**在 Mac/Linux：**
```bash
git clone git@github.com:你的用户名/claude-sessions.git ~/.claude/SESSIONS
```

**自动同步（所有设备）：**
- WSL: `./setup-auto-sync.sh`
- Mac/Linux: `./setup-auto-sync.sh`
- Windows PowerShell: 使用任务计划程序

---

## 查看会话对话

### WSL2/Git Bash

```bash
# 获取最新会话 ID
SESSION_ID=$(bun ~/claude-history/tools/SessionQuery.ts recent 1 | jq -r '.[0].session_id')

# 查看对话
~/claude-history/tools/show-conversation.sh $SESSION_ID
```

### PowerShell

```powershell
# 使用 jq（需要安装）
$SessionId = (bun SessionQuery.ts recent 1 | ConvertFrom-Json)[0].session_id
bun SessionQuery.ts recent 1 | ConvertFrom-Json | Select-Object -ExpandProperty conversation
```

或者直接查看 JSON：
```powershell
bun SessionQuery.ts recent 1 | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

---

## 路径对照

| 描述 | Linux/Mac | Windows (原生) | WSL |
|------|-----------|---------------|-----|
| 配置目录 | `~/.claude/` | `C:\Users\用户名\.claude\` | `/home/用户名/.claude/` |
| 会话数据 | `~/.claude/SESSIONS/` | `C:\Users\用户名\.claude\SESSIONS\` | `/home/用户名/.claude/SESSIONS/` |
| 安装目录 | `/data/app/claude-history/` | `C:\...\claude-history\` | `/home/.../claude-history/` |

### WSL 访问 Windows 文件
```bash
cd /mnt/c/Users/你的用户名/Downloads
```

### Windows 访问 WSL 文件
```
\\wsl$\Ubuntu\home\你的用户名\
```

---

## 常见问题

### Q: PowerShell 提示无法运行脚本？

**A:** 运行以下命令允许脚本执行：
```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Q: 符号链接创建失败？

**A:** 需要管理员权限：
1. 右键点击 PowerShell
2. 选择"以管理员身份运行"
3. 重新创建符号链接

### Q: Git 推送失败（Permission denied）？

**A:** 配置 SSH 密钥：
```bash
# 生成密钥
ssh-keygen -t ed25519 -C "your_email@example.com"

# 复制公钥
cat ~/.ssh/id_ed25519.pub

# 添加到 GitHub: Settings -> SSH Keys
```

### Q: Bun 命令找不到？

**A:** 重启 PowerShell 或刷新环境变量：
```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
```

---

## 推荐配置总结

| 场景 | 推荐方案 |
|------|---------|
| **单台 Windows** | WSL2 + 本地存储 |
| **多台 Windows** | WSL2 + Git 同步 |
| **Windows + Mac/Linux** | WSL2 + Git 同步 |
| **企业环境** | PowerShell + OneDrive |

---

## 下一步

1. **选择方案**（WSL2 或 PowerShell）
2. **运行安装脚本**
3. **设置同步**（可选）
4. **测试查询**

**需要帮助？** 查看完整文档：
- `cat WINDOWS.md`
- `cat SYNC-GUIDE.md`
