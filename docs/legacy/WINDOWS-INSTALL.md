# Windows 安装指南

## ✅ 已修复 Windows 支持

**版本**: v1.1.1+

现在 `claude-daemon` 可以在 Windows 上正常安装了！

---

## 🚀 安装方法

### 方式 1: npm 全局安装（推荐）

```powershell
# 1. 安装包
npm install -g @jhihjian/claude-daemon

# 2. 运行安装（会自动使用 install.ps1）
claude-daemon install
```

### 方式 2: npx 安装

```powershell
npx @jhihjian/claude-daemon install
```

---

## 📁 Windows 下的文件位置

### Claude Code 配置和数据

```
C:\Users\你的用户名\.claude\
├── settings.json              # Claude Code 配置
├── hooks\                     # Hooks 脚本
│   ├── SessionRecorder.hook.ts
│   ├── SessionToolCapture-v2.hook.ts
│   └── SessionAnalyzer.hook.ts
│
└── SESSIONS\                  # 会话数据（你的记录存这里）
    ├── raw\                   # 原始会话（JSONL）
    │   └── 2026-01\
    │       └── session-xxx.jsonl
    │
    ├── analysis\              # 分析结果
    │   ├── summaries\         # 会话摘要
    │   ├── by-type\           # 按类型索引
    │   └── by-directory\      # 按目录索引
    │
    └── index\                 # 全局索引
        └── metadata.json
```

---

## 🎯 系统自动检测

CLI 会自动检测你的系统：

- **Windows**: 使用 `install.ps1` (PowerShell 脚本)
- **Linux/macOS**: 使用 `install.sh` (Bash 脚本)

---

## ⚠️ 常见问题

### 1. PowerShell 执行策略错误

**错误信息**:
```
无法加载文件，因为在此系统上禁止运行脚本
```

**解决方案**:

以**管理员身份**运行 PowerShell，然后：

```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

或者临时绕过：

```powershell
powershell -ExecutionPolicy Bypass -Command "claude-daemon install"
```

### 2. WSL 相关错误

如果看到 WSL 相关错误，说明系统尝试调用了 WSL 的 bash。

**解决方案**:

确保使用最新版本的包（v1.1.1+），它会自动检测 Windows 并使用 PowerShell。

```powershell
# 更新到最新版本
npm install -g @jhihjian/claude-daemon@latest

# 重新安装
claude-daemon install
```

### 3. Bun 未安装

**错误信息**:
```
Bun 未安装
```

**解决方案**:

在 PowerShell 中安装 Bun：

```powershell
irm bun.sh/install.ps1 | iex
```

或访问：https://bun.sh/

---

## 🔍 验证安装

### 检查 Hooks

```powershell
ls $env:USERPROFILE\.claude\hooks
```

应该看到 3 个 `.hook.ts` 文件。

### 检查数据目录

```powershell
ls $env:USERPROFILE\.claude\SESSIONS
```

应该看到 `raw`、`analysis`、`index` 目录。

### 测试记录

```powershell
# 使用 Claude Code
claude

# 检查是否有新的会话记录
ls $env:USERPROFILE\.claude\SESSIONS\raw\$(Get-Date -Format "yyyy-MM")
```

---

## 📊 查询命令

安装完成后，可以使用：

```powershell
# 查看最近会话
claude-sessions recent 5

# 按类型查询
claude-sessions type coding

# 查看统计
claude-sessions stats global
```

---

## 💡 提示

1. **重启终端**: 安装后需要重启 PowerShell 或命令提示符

2. **路径**: Windows 使用 `%USERPROFILE%\.claude` 而不是 `~/.claude`

3. **权限**: 某些操作可能需要管理员权限

4. **编码**: PowerShell 默认使用 UTF-8，不需要额外配置

---

## 🆘 获取帮助

如果遇到问题：

1. 查看详细日志：
   ```powershell
   $env:SESSION_LOG_LEVEL = "DEBUG"
   claude-daemon install
   ```

2. 提交 Issue：
   https://github.com/JhihJian/claude-daemon/issues

3. 查看文档：
   https://github.com/JhihJian/claude-daemon

---

## 🎉 安装成功后

你的 Claude Code 会话将会自动记录到：

```
C:\Users\你的用户名\.claude\SESSIONS\
```

每次使用 Claude Code 时，系统会自动：
- 📝 记录会话信息
- 🔍 记录工具调用
- 💬 保存对话内容
- 📊 生成统计分析

所有数据安全保存在本地！
