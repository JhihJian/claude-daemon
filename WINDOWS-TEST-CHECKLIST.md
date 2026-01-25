# Windows 测试清单 - v1.2.0

## ⚠️ 发布前必须测试

在 Windows 环境下完成以下测试后，才能发布到 npm。

---

## 📋 基础功能测试

### 1. 安装流程
```powershell
# 清理旧安装（如果有）
Remove-Item -Path "$env:USERPROFILE\.claude" -Recurse -Force -ErrorAction SilentlyContinue
npm uninstall -g @jhihjian/claude-daemon

# 全局安装
npm install -g @jhihjian/claude-daemon

# 运行安装
claude-daemon install
```

**验证**:
- [ ] Bun 是否正确安装/检测
- [ ] 目录是否创建: `~\.claude\hooks\`, `~\.claude\lib\`, `~\.claude\tools\`, `~\.claude\SESSIONS\`
- [ ] Hooks 文件是否复制（3个 .ts 文件）
- [ ] Lib 文件是否复制（3个 .ts 文件）
- [ ] Tools 文件是否复制（3个 .ts 文件）
- [ ] settings.json 是否生成
- [ ] claude-sessions.ps1 是否创建在 `~\bin\`
- [ ] 无报错

---

### 2. 文件内容验证
```powershell
# 检查 hooks
ls $env:USERPROFILE\.claude\hooks

# 检查 lib
ls $env:USERPROFILE\.claude\lib

# 检查 tools
ls $env:USERPROFILE\.claude\tools

# 检查 settings.json
cat $env:USERPROFILE\.claude\settings.json

# 检查查询脚本
cat $env:USERPROFILE\bin\claude-sessions.ps1
```

**验证**:
- [ ] SessionRecorder.hook.ts 存在
- [ ] SessionToolCapture-v2.hook.ts 存在
- [ ] SessionAnalyzer.hook.ts 存在
- [ ] logger.ts, errors.ts, config.ts 存在
- [ ] SessionQuery.ts, SessionStats.ts 存在
- [ ] settings.json 格式正确
- [ ] claude-sessions.ps1 中的路径指向 `~\.claude\tools\`（而非 npm 包）

---

### 3. 查询命令测试
```powershell
# 重启 PowerShell

# 测试帮助
claude-sessions

# 测试具体命令（没有数据时应该返回空或友好提示）
claude-sessions recent 5
claude-sessions stats global
```

**验证**:
- [ ] 命令可以执行（不报错"找不到命令"）
- [ ] 帮助信息正常显示
- [ ] 即使没有数据，也有友好提示（不报错）

---

### 4. Claude Code 集成测试
```powershell
# 运行 Claude Code
claude

# 输入一个简单问题
"今天是星期几"

# 退出 Claude Code
```

**验证**:
- [ ] Claude Code 正常启动
- [ ] 没有 hook 相关错误
- [ ] 会话结束后检查数据文件

```powershell
# 检查是否生成会话文件
ls $env:USERPROFILE\.claude\SESSIONS\raw\$(Get-Date -Format "yyyy-MM")

# 查看会话文件内容
cat $env:USERPROFILE\.claude\SESSIONS\raw\$(Get-Date -Format "yyyy-MM")\session-*.jsonl

# 检查是否生成摘要
ls $env:USERPROFILE\.claude\SESSIONS\analysis\summaries\$(Get-Date -Format "yyyy-MM")
```

**验证**:
- [ ] 生成了 session-*.jsonl 文件
- [ ] 文件包含 session_start 事件
- [ ] 文件包含 tool_use 事件（如果有工具调用）
- [ ] 生成了 summary-*.json 文件
- [ ] 摘要包含对话内容

---

### 5. 查询历史数据
```powershell
claude-sessions recent 1
claude-sessions type mixed
claude-sessions stats global
```

**验证**:
- [ ] 能够查询到刚才的会话
- [ ] 数据格式正确（JSON）
- [ ] 包含对话内容

---

### 6. 问题 #10 验证（关键）
```powershell
# 卸载 npm 包
npm uninstall -g @jhihjian/claude-daemon

# 查询命令应该仍然工作
claude-sessions recent 1
```

**验证**:
- [ ] ✅ 卸载 npm 包后，查询命令仍然可用
- [ ] ✅ 数据仍然可以查询

```powershell
# 重新安装
npm install -g @jhihjian/claude-daemon

# 更新文件（不运行 install，直接测试）
claude-sessions recent 1
```

**验证**:
- [ ] ✅ 重新安装后，旧的查询命令仍然可用
- [ ] ✅ 引用的是用户目录中的文件，而非新安装的包

---

## 🔍 边界情况测试

### 7. 中文路径测试
```powershell
# 如果用户名包含中文，检查是否正常工作
# （如果你的用户名不是中文，可以跳过）
```

**验证**:
- [ ] 中文路径下所有功能正常
- [ ] 文件编码正确（UTF-8）

---

### 8. 路径包含空格测试
```powershell
# 检查 Bun 路径
(Get-Command bun).Source

# 如果路径包含空格，验证查询命令是否正常
```

**验证**:
- [ ] 带空格的路径正常工作
- [ ] PowerShell 正确转义

---

### 9. 权限测试
```powershell
# 以普通用户（非管理员）运行
claude-daemon install
```

**验证**:
- [ ] 普通用户可以安装
- [ ] 不需要管理员权限

---

### 10. 重复安装测试
```powershell
# 多次运行安装
claude-daemon install
claude-daemon install
```

**验证**:
- [ ] 不报错
- [ ] 正确备份旧的 settings.json
- [ ] 文件被正确覆盖/更新

---

## 📊 测试结果记录

### 环境信息
- Windows 版本: __________
- PowerShell 版本: __________
- Node.js 版本: __________
- Bun 版本: __________
- 用户名是否包含中文: [ ] 是 [ ] 否
- 路径是否包含空格: [ ] 是 [ ] 否

### 测试结果
- [ ] 所有基础功能测试通过
- [ ] 所有边界情况测试通过
- [ ] 问题 #10 验证通过
- [ ] 发现新问题（请描述）:

---

## ✅ 发布检查清单

发布前确认：
- [ ] 所有测试通过
- [ ] 版本号正确（1.2.0）
- [ ] CHANGELOG 已更新
- [ ] README 已更新（添加 Windows 说明）
- [ ] 没有硬编码的测试路径
- [ ] 没有调试代码

---

## 🚀 发布命令

```bash
# 确认测试通过后
npm publish

# 验证发布
npm view @jhihjian/claude-daemon
```

---

## 📝 已知限制

记录测试中发现的限制或问题：

1.
2.
3.
