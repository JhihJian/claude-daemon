# 主机名记录功能 - 更新说明

## 更新内容 (v1.1)

### 新增功能

**多设备识别**: 系统现在记录每个会话来自哪台电脑。

### 记录的信息

每个会话现在包含：

- ✅ **hostname**: 主机名（如 `jhihjian-MACO`）
- ✅ **user**: 用户名（如 `jhihjian`）
- ✅ **platform**: 操作系统（如 `linux`, `darwin`, `win32`）

### 数据格式

**Raw 会话数据 (session_start):**
```json
{
  "event_type": "session_start",
  "session_id": "...",
  "timestamp": "2026-01-24T09:44:53.857Z",
  "working_directory": "/data/app",
  "hostname": "jhihjian-MACO",
  "user": "jhihjian",
  "platform": "linux"
}
```

**Summary 数据:**
```json
{
  "session_id": "...",
  "hostname": "jhihjian-MACO",
  "user": "jhihjian",
  "platform": "linux",
  "working_directory": "/data/app",
  "conversation": {...}
}
```

---

## 新增查询功能

### 按主机名查询

```bash
# 查询特定主机的会话
~/.bun/bin/bun /data/app/claude-history/tools/SessionQuery.ts host jhihjian-MACO

# 或使用别名
~/.bun/bin/bun /data/app/claude-history/tools/SessionQuery.ts hostname my-computer
```

### 查看会话详情

使用 `show-conversation.sh` 时会自动显示主机信息：

```bash
/data/app/claude-history/tools/show-conversation.sh <session_id>
```

**输出示例:**
```
========================================
会话详情
========================================

📋 会话ID: f94f22de-344a-44ad-8c9a-dd6522ef0827
🖥️  主机: jhihjian-MACO (jhihjian@linux)
📁 工作目录: /data/app
📅 时间: 2026-01-24T09:44:53.857Z
🏷️  类型: mixed
```

---

## 多设备场景

### 示例：查看来自不同电脑的会话

**电脑 A (MacBook):**
```bash
# 会话记录为: hostname=MacBook-Pro, user=john, platform=darwin
```

**电脑 B (Linux 服务器):**
```bash
# 会话记录为: hostname=server-01, user=john, platform=linux
```

**电脑 C (Windows):**
```bash
# 会话记录为: hostname=DESKTOP-ABC, user=john, platform=win32
```

### 查询特定电脑的会话

```bash
# 查看 MacBook 的所有会话
~/.bun/bin/bun SessionQuery.ts host MacBook-Pro

# 查看 Linux 服务器的会话
~/.bun/bin/bun SessionQuery.ts host server-01

# 查看 Windows 电脑的会话
~/.bun/bin/bun SessionQuery.ts host DESKTOP-ABC
```

---

## 统计分析

### 按主机统计会话数量

```bash
# 获取所有会话
~/.bun/bin/bun SessionQuery.ts recent 1000 | \
  jq 'group_by(.hostname) | map({hostname: .[0].hostname, count: length}) | sort_by(-.count)'
```

**输出示例:**
```json
[
  {"hostname": "jhihjian-MACO", "count": 45},
  {"hostname": "server-01", "count": 23},
  {"hostname": "MacBook-Pro", "count": 12}
]
```

### 查看每台电脑的使用模式

```bash
# 查看特定主机的会话类型分布
~/.bun/bin/bun SessionQuery.ts host jhihjian-MACO | \
  jq 'group_by(.session_type) | map({type: .[0].session_type, count: length})'
```

---

## Git 同步注意事项

### 避免冲突

由于现在记录了主机名，多台电脑同时工作不会产生相同的会话ID，但仍建议：

**方案 1: 按主机名分目录（可选）**

修改 `SessionRecorder.hook.ts`:
```typescript
const sessionFile = join(
  rawDir,
  hostname(),  // 按主机分目录
  `session-${sessionId}.jsonl`
);
```

**方案 2: 定期同步**

使用自动同步脚本，每小时同步一次：
```bash
./setup-auto-sync.sh
```

---

## 升级现有安装

### 自动升级

如果你已经安装了旧版本，只需重新运行安装脚本：

```bash
cd /data/app/claude-history
./install.sh
```

### 手动升级

如果你自定义了hooks路径，更新这些文件：

1. **更新 hooks:**
   ```bash
   cp hooks/SessionRecorder.hook.ts ~/.claude/hooks/
   cp hooks/SessionAnalyzer.hook.ts ~/.claude/hooks/
   ```

2. **更新查询工具:**
   ```bash
   cp tools/SessionQuery.ts <你的路径>/
   cp tools/show-conversation.sh <你的路径>/
   chmod +x <你的路径>/show-conversation.sh
   ```

### 验证升级

```bash
# 测试会话记录
echo "测试主机名" | claude -p

# 查看最新会话
~/.bun/bin/bun SessionQuery.ts recent 1 | jq '.[0] | {hostname, user, platform}'
```

应该输出：
```json
{
  "hostname": "你的主机名",
  "user": "你的用户名",
  "platform": "linux/darwin/win32"
}
```

---

## 兼容性

### 旧会话数据

- ✅ 旧会话（没有主机名）会显示为 `hostname: null`
- ✅ 查询工具向后兼容
- ✅ 不影响现有功能

### 跨平台

- ✅ **Linux**: 完全支持
- ✅ **macOS**: 完全支持
- ✅ **Windows**: 支持（WSL2 和 PowerShell）

**平台值对照:**
- Linux: `"linux"`
- macOS: `"darwin"`
- Windows: `"win32"`

---

## 常用命令总结

```bash
# 查询
~/.bun/bin/bun SessionQuery.ts recent 10        # 最近10个会话
~/.bun/bin/bun SessionQuery.ts host my-computer # 特定主机
~/.bun/bin/bun SessionQuery.ts type coding      # 编码类会话

# 显示详情
show-conversation.sh <session_id>               # 包含主机信息

# 统计
bun SessionQuery.ts recent 100 | \
  jq 'group_by(.hostname) | map({host: .[0].hostname, count: length})'
```

---

## 更新日志

### v1.1 (2026-01-24)

**新增:**
- ✅ 记录主机名 (hostname)
- ✅ 记录用户名 (user)
- ✅ 记录操作系统 (platform)
- ✅ 按主机名查询功能
- ✅ show-conversation.sh 显示主机信息

**改进:**
- ✅ SessionRecorder.hook.ts - 添加主机名记录
- ✅ SessionAnalyzer.hook.ts - 保留主机名到summary
- ✅ SessionQuery.ts - 添加 queryByHostname 方法
- ✅ show-conversation.sh - 显示主机信息

**文件变更:**
- `hooks/SessionRecorder.hook.ts`
- `hooks/SessionAnalyzer.hook.ts`
- `tools/SessionQuery.ts`
- `tools/show-conversation.sh`

---

## 技术细节

### 主机名获取

使用 Node.js 的 `os.hostname()`:
```typescript
import { hostname } from 'os';

const host = hostname();  // 返回主机名
```

### 跨平台兼容性

```typescript
// 用户名获取（跨平台）
const user = process.env.USER ||           // Linux/macOS
             process.env.USERNAME ||       // Windows
             'unknown';

// 平台检测
const platform = process.platform;  // 'linux', 'darwin', 'win32'
```

---

**版本**: v1.1
**日期**: 2026-01-24
**兼容性**: 向后兼容 v1.0
