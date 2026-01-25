# 1.3.1 版本 - Windows Hooks 修复

## 问题描述

**版本**: 1.3.0
**问题**: 在 Windows 上启动 Claude Code 时，系统会弹出"如何打开 .ts 文件"的询问窗口

### 根本原因

Windows 不支持 shebang (`#!/usr/bin/env bun`)，当 settings.json 中的 hook 命令直接指向 `.ts` 文件时：

```json
{
  "command": "C:\\Users\\username\\.claude\\hooks\\SessionRecorder.hook.ts"
}
```

Windows 不知道如何执行 `.ts` 文件，所以会弹出文件关联询问窗口。

### 在 Linux/macOS 上

由于 shebang 的支持，直接执行 `.ts` 文件是可行的：
```bash
#!/usr/bin/env bun
# 系统会自动使用 bun 执行
```

### 在 Windows 上

Windows 需要显式指定解释器：
```powershell
bun C:\path\to\script.ts
```

---

## 解决方案

### 修改内容

所有 Windows 安装脚本现在会生成包含 `bun` 命令的 settings.json：

**修改前 (1.3.0)**:
```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "C:\\Users\\username\\.claude\\hooks\\SessionRecorder.hook.ts"
          }
        ]
      }
    ]
  }
}
```

**修改后 (1.3.1)**:
```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun C:\\Users\\username\\.claude\\hooks\\SessionRecorder.hook.ts"
          }
        ]
      }
    ]
  }
}
```

### 修改的文件

1. ✅ `install-windows-final.ps1` (推荐使用)
2. ✅ `install-windows-v2.ps1`
3. ✅ `install-windows.ps1`
4. ✅ `install.ps1`

所有脚本现在都会在 Windows 上生成正确的 `bun <path>` 格式命令。

---

## 升级指南

### 从 1.3.0 升级到 1.3.1

如果你已经安装了 1.3.0 版本并遇到了这个问题：

#### 方法一：重新安装（推荐）

```bash
# 1. 卸载旧版本
npm uninstall -g @jhihjian/claude-daemon

# 2. 安装新版本
npm install -g @jhihjian/claude-daemon

# 3. 重新运行安装
claude-daemon install
```

#### 方法二：手动修复 settings.json

编辑 `C:\Users\你的用户名\.claude\settings.json`：

在每个 `command` 前面添加 `bun `：

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun C:\\Users\\你的用户名\\.claude\\hooks\\SessionRecorder.hook.ts"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun C:\\Users\\你的用户名\\.claude\\hooks\\SessionToolCapture-v2.hook.ts"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun C:\\Users\\你的用户名\\.claude\\hooks\\SessionAnalyzer.hook.ts"
          }
        ]
      }
    ]
  }
}
```

---

## 测试验证

### 测试步骤

1. 安装 1.3.1 版本
2. 运行 `claude-daemon install`
3. 检查 settings.json
4. 启动 Claude Code
5. 验证不再弹出文件关联窗口

### 预期结果

✅ `settings.json` 中所有 hook 命令格式为：`bun C:\\...\\hook.ts`
✅ 启动 Claude Code 时不再弹出窗口
✅ Hooks 正常执行，会话记录正常

---

## 版本对比

| 功能 | 1.3.0 | 1.3.1 |
|------|-------|-------|
| npm 包安装 | ✅ | ✅ |
| 文件安装 | ✅ | ✅ |
| Linux/macOS Hooks | ✅ | ✅ |
| Windows Hooks | ❌ 弹窗 | ✅ 正常 |
| Windows 兼容性 | 部分 | ✅ 完全 |

---

## 技术细节

### Windows 命令执行

在 Windows 上，Claude Code 执行 hook 命令时：

1. **直接执行 .ts 文件** (1.3.0)
   ```
   C:\Users\...\SessionRecorder.hook.ts
   → Windows 找不到文件关联
   → 弹出"如何打开此文件"窗口
   ```

2. **使用 bun 执行** (1.3.1)
   ```
   bun C:\Users\...\SessionRecorder.hook.ts
   → Windows 找到 bun.exe
   → bun 执行 TypeScript 文件
   → Hook 正常运行
   ```

### 代码修改示例

```powershell
# 修改前
$SettingsJson = @"
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "$HookRecorderJson"
      }]
    }]
  }
}
"@

# 修改后
$SettingsJson = @"
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "bun $HookRecorderJson"
      }]
    }]
  }
}
"@
```

---

## 常见问题

### Q1: 为什么 Linux/macOS 不需要 `bun` 前缀？

A: Linux 和 macOS 支持 shebang (`#!/usr/bin/env bun`)，系统会自动识别并使用正确的解释器。

### Q2: 如果我手动修复了 1.3.0，还需要升级吗？

A: 建议升级到 1.3.1，这样以后重新安装时会自动使用正确的配置。

### Q3: 这个修复会影响已有的会话数据吗？

A: 不会。这只是修改了 hook 的执行方式，不影响已记录的数据。

### Q4: 我的 bun 安装在自定义路径怎么办？

A: 只要 `bun` 命令在 PATH 中可用即可。你可以运行 `bun --version` 验证。

---

## 总结

✅ **1.3.1 版本完全修复了 Windows hooks 执行问题**

- 不再弹出文件关联窗口
- Hooks 在 Windows 上正常工作
- 完全向后兼容
- 保持与 Linux/macOS 的一致性

建议所有 Windows 用户升级到 1.3.1 版本！
