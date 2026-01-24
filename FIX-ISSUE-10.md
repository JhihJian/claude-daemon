# 问题 #10 修复报告

## 🎯 问题描述

**原始问题**: 生成的 `claude-sessions.ps1` 脚本硬编码引用 npm 包内的 `tools/` 目录。如果用户更新/卸载/重装 npm 包，路径会失效。

**影响**: 用户在更新包后，查询命令（`claude-sessions`）会失败。

---

## ✅ 修复方案

### 核心思路

**将所有运行时依赖复制到用户目录 `~/.claude/`，使其独立于 npm 包。**

### 文件结构对比

#### 修复前
```
npm 包位置:
C:\Users\用户名\AppData\Roaming\npm\node_modules\@jhihjian\claude-daemon\
├── hooks/           # ✅ 会复制到 ~/.claude/hooks/
├── lib/             # ❌ 不会复制
├── tools/           # ❌ 不会复制（问题所在）

用户目录:
C:\Users\用户名\.claude\
├── hooks/           # ✅ 从 npm 包复制
├── SESSIONS/        # ✅ 运行时生成
└── settings.json    # ✅ 安装时生成

查询脚本引用:
claude-sessions.ps1 → npm包/tools/SessionQuery.ts  # ❌ 依赖 npm 包
```

#### 修复后
```
npm 包位置:
C:\Users\用户名\AppData\Roaming\npm\node_modules\@jhihjian\claude-daemon\
├── hooks/
├── lib/
├── tools/
└── install-windows-final.ps1  # ✅ 新的安装脚本

用户目录:
C:\Users\用户名\.claude\
├── hooks/           # ✅ 从 npm 包复制（持久化）
├── lib/             # ✅ 从 npm 包复制（持久化）
├── tools/           # ✅ 从 npm 包复制（持久化）
├── SESSIONS/        # ✅ 运行时生成
└── settings.json    # ✅ 安装时生成

查询脚本引用:
claude-sessions.ps1 → ~/.claude/tools/SessionQuery.ts  # ✅ 独立于 npm 包
```

---

## 🔧 具体修复

### 1. 新增步骤：复制 lib 目录

```powershell
# [3/7] 安装共享库
$LibSourceDir = Join-Path $ScriptDir "lib"
$LibTargetDir = Join-Path $ClaudeDir "lib"

$LibFiles = Get-ChildItem -Path $LibSourceDir -Filter "*.ts"
foreach ($LibFile in $LibFiles) {
    Copy-Item -Path $LibFile.FullName -Destination $LibTargetDir -Force
}
```

**原因**: hooks 依赖 lib 目录中的模块（logger.ts, errors.ts, config.ts）

### 2. 新增步骤：复制 tools 目录

```powershell
# [5/7] 安装查询工具
$ToolsSourceDir = Join-Path $ScriptDir "tools"
$ToolsTargetDir = Join-Path $ClaudeDir "tools"

$ToolFiles = Get-ChildItem -Path $ToolsSourceDir -File
foreach ($ToolFile in $ToolFiles) {
    Copy-Item -Path $ToolFile.FullName -Destination $ToolsTargetDir -Force
}
```

**关键**: 将 tools 复制到用户目录，而不是引用 npm 包内的文件

### 3. 修改查询脚本引用路径

```powershell
# 使用用户目录中的 tools（持久化路径）
$ToolQueryPath = Join-Path $ToolsTargetDir "SessionQuery.ts"  # ~/.claude/tools/
$ToolStatsPath = Join-Path $ToolsTargetDir "SessionStats.ts"  # ~/.claude/tools/
```

**之前**:
```powershell
$ToolsDir = "$ScriptDir\tools"  # npm包内的路径（会失效）
```

**之后**:
```powershell
$ToolQueryPath = "$env:USERPROFILE\.claude\tools\SessionQuery.ts"  # 用户目录（持久化）
```

### 4. 添加错误检查

```powershell
# 在生成的 claude-sessions.ps1 中
if (-not (Test-Path $QueryTool)) {
    Write-Host "错误: 找不到查询工具" -ForegroundColor Red
    Write-Host "路径: $QueryTool" -ForegroundColor Yellow
    Write-Host "请重新运行安装: claude-daemon install" -ForegroundColor Yellow
    exit 1
}
```

---

## 📊 优势

### 修复前的问题
1. ❌ 更新 npm 包后查询命令失败
2. ❌ 卸载 npm 包后无法查询历史
3. ❌ 依赖 npm 包位置，不够健壮

### 修复后的优势
1. ✅ 更新/卸载 npm 包不影响查询功能
2. ✅ 所有文件持久化到用户目录
3. ✅ 完全独立于 npm 包位置
4. ✅ 即使删除 npm 缓存也能正常工作

---

## 🧪 测试场景

### 场景 1: 正常安装
```powershell
npm install -g @jhihjian/claude-daemon@1.2.0
claude-daemon install
claude-sessions recent 5  # ✅ 应该工作
```

### 场景 2: 更新包
```powershell
npm update -g @jhihjian/claude-daemon
claude-sessions recent 5  # ✅ 仍然工作（引用 ~/.claude/tools/）
```

### 场景 3: 卸载包
```powershell
npm uninstall -g @jhihjian/claude-daemon
claude-sessions recent 5  # ✅ 仍然工作（文件在 ~/.claude/）
```

### 场景 4: 重新安装
```powershell
npm install -g @jhihjian/claude-daemon@1.2.0
claude-daemon install     # ✅ 覆盖旧文件，更新到最新版本
```

---

## 📁 文件清单

### 新增文件
- `install-windows-final.ps1` - 修复后的 Windows 安装脚本

### 修改文件
- `bin/cli.js` - 优先使用 install-windows-final.ps1
- `package.json` - 版本升级到 1.2.0，包含新脚本

---

## ⚠️ 注意事项

### 1. 磁盘空间
复制文件到用户目录会占用额外空间（约 100KB），但换来了稳定性。

### 2. 更新机制
当用户重新运行 `claude-daemon install` 时，会覆盖 `~/.claude/` 中的文件，实现更新。

### 3. lib 目录的导入路径
hooks 中的导入路径需要使用相对路径：
```typescript
import { logger } from '../lib/logger.ts';  // ✅ 正确
```

这样在 `~/.claude/hooks/` 中运行时，可以找到 `~/.claude/lib/`。

---

## 🎯 下一步

1. ✅ 修复完成
2. ⏭ 在 Windows 上实际测试
3. ⏭ 验证所有场景
4. ⏭ 发布到 npm

---

## 📝 版本历史

- **v1.1.0** - 初始 npm 发布（有问题 #10）
- **v1.1.1** - 添加 Windows 支持（未解决问题 #10）
- **v1.1.2** - PowerShell 脚本编码修复（未解决问题 #10）
- **v1.2.0** - 修复问题 #10，文件持久化到用户目录 ✅
