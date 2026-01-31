# Windows 安装脚本 - 潜在问题清单

## ⚠️ 已识别的问题

### 1. ✅ 已修复：变量作用域问题

**问题**: 在 `install-windows.ps1` 中，生成的 `claude-sessions.ps1` 脚本引用了 `$ScriptDir` 变量，但该变量在脚本运行时不存在。

**原因**:
```powershell
$ToolsDir = "$ScriptDir\tools"  # ❌ $ScriptDir 在运行时不存在
```

**修复**: 使用绝对路径硬编码到生成的脚本中（`install-windows-v2.ps1`）

---

### 2. ✅ 已修复：路径分隔符问题

**问题**: Windows 使用反斜杠 `\`，在 JSON 中需要转义为 `\\`

**修复**: 在生成 JSON 前使用 `.Replace('\', '\\')`

---

### 3. ⚠️ 潜在问题：Bun 路径包含空格

**问题**: 如果 Bun 安装在包含空格的路径（如 `C:\Program Files\`），可能导致执行失败。

**检查**:
```powershell
# 在 claude-sessions.ps1 中
& $BunExe $QueryTool recent $Arg1  # ✅ 正确，PowerShell 会自动处理
```

**状态**: 应该没问题，PowerShell 的 `&` 调用运算符会正确处理带空格的路径。

---

### 4. ⚠️ 潜在问题：npm 全局安装路径变化

**问题**: npm 全局安装后，包的位置可能在：
- `C:\Users\用户名\AppData\Roaming\npm\node_modules\@jhihjian\claude-daemon\`

当生成的 `claude-sessions.ps1` 引用该路径时，如果用户卸载/重装 npm 包，路径会失效。

**风险**: 中等

**建议解决方案**:
- 将 `tools/` 目录复制到用户目录，而不是引用 npm 包内的文件
- 或者在查询脚本中动态查找工具位置

---

### 5. ✅ 已处理：PowerShell 执行策略

**问题**: Windows 默认可能禁止运行 PowerShell 脚本

**解决方案**: CLI 使用 `-ExecutionPolicy Bypass` 参数

```javascript
spawn('powershell.exe', [
  '-ExecutionPolicy', 'Bypass',  // ✅ 绕过执行策略
  '-File', installScript
])
```

---

### 6. ⚠️ 潜在问题：Hooks 的 Shebang

**问题**: Hooks 文件开头是 `#!/usr/bin/env bun`，Windows 不识别 shebang

**影响**: 可能无法执行

**检查**: Claude Code 如何执行 hooks？
- 如果直接调用 `bun SessionRecorder.hook.ts` ✅ 没问题
- 如果尝试执行 `./SessionRecorder.hook.ts` ❌ Windows 会失败

**需要验证**: Claude Code 在 Windows 上的 hook 执行机制

---

### 7. ⚠️ 潜在问题：文件权限

**问题**: Windows 没有 Unix 的 700/600 权限概念

**当前**: 脚本中没有设置 Windows ACL 权限

**风险**: 低（Windows 默认权限通常足够安全）

**建议**: 可以添加 ACL 设置，但非必需

---

### 8. ⚠️ 未测试：中文路径

**问题**: 如果用户名包含中文，路径可能出现编码问题

**示例**:
```
C:\Users\张三\.claude\
```

**风险**: 中等

**需要测试**:
- Bun 是否支持中文路径
- PowerShell UTF-8 编码是否正确

---

### 9. ✅ 已处理：工具不存在

**问题**: 如果 `tools/` 目录不存在

**修复**: 添加了检查
```powershell
if (-not (Test-Path $HooksSourceDir)) {
    Write-Host "✗ 找不到 hooks 目录" -ForegroundColor Red
    exit 1
}
```

---

### 10. ⚠️ 关键问题：npm 包安装后的路径引用

**问题**: 当用户通过 npm 安装后：
1. 包安装在: `C:\Users\用户名\AppData\Roaming\npm\node_modules\@jhihjian\claude-daemon\`
2. 生成的 `claude-sessions.ps1` 会硬编码引用该路径下的 `tools/`
3. 如果用户：
   - 卸载重装 npm 包
   - 清理 npm 缓存
   - 更新包版本

   路径可能失效！

**风险**: 高

**建议解决方案**:

#### 方案 A: 复制 tools 到用户目录（推荐）

```powershell
# 在安装时
$UserToolsDir = Join-Path $ClaudeDir "tools"
Copy-Item -Path (Join-Path $ScriptDir "tools") -Destination $UserToolsDir -Recurse -Force

# 在 claude-sessions.ps1 中引用
$QueryTool = "$env:USERPROFILE\.claude\tools\SessionQuery.ts"
```

#### 方案 B: 动态查找（更健壮）

```powershell
# 在 claude-sessions.ps1 中
$PossiblePaths = @(
    "$env:USERPROFILE\.claude\tools",
    "$env:APPDATA\npm\node_modules\@jhihjian\claude-daemon\tools"
)

foreach ($Path in $PossiblePaths) {
    if (Test-Path $Path) {
        $ToolsDir = $Path
        break
    }
}
```

---

## 📋 测试清单

在 Windows 上发布前应该测试：

- [ ] 基础安装流程
- [ ] Bun 自动安装
- [ ] Hooks 文件复制
- [ ] settings.json 生成
- [ ] 查询工具是否可用
- [ ] 路径包含空格的情况
- [ ] 用户名包含中文的情况
- [ ] 卸载重装 npm 包后查询工具是否仍可用
- [ ] Claude Code 是否能正确执行 hooks
- [ ] 会话数据是否正确记录

---

## 🎯 建议

1. **立即修复**: 实现方案 A，复制 tools 到用户目录
2. **测试**: 在真实 Windows 环境测试
3. **文档**: 添加已知限制和故障排除指南
4. **版本**: 发布为 beta 版本，收集反馈

---

## 当前状态

- ✅ 基础安装逻辑完成
- ✅ 路径处理正确
- ⚠️ 关键问题 #10 需要修复
- ❓ 需要实际 Windows 测试
