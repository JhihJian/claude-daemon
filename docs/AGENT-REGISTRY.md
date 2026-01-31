# Agent注册表 API文档

## 概述

AgentRegistry负责管理所有Agent的注册、状态更新和查询。

## 数据类型

### AgentInfo

```typescript
interface AgentInfo {
  sessionId: string;           // Claude Code会话ID
  type: 'master' | 'worker';   // Agent类型
  label: string;               // 显示名称
  status: 'idle' | 'busy' | 'error' | 'disconnected';
  agentConfig: string;         // 配置包名称
  workingDir: string;          // 工作目录
  parentId?: string;           // 父Agent ID
  createdAt: number;           // 创建时间戳
  lastHeartbeat: number;       // 最后心跳时间戳
  metadata?: Record<string, any>;
}
```

### AgentType

- `master`: 主Agent，负责任务分解和结果汇总
- `worker`: 子Agent，执行具体任务

### AgentStatus

- `idle`: 空闲状态，可以接收新任务
- `busy`: 工作中，正在执行任务
- `error`: 发生错误
- `disconnected`: 超时未心跳，已失联

## Daemon Socket API

### register_agent

注册新Agent

```json
{
  "action": "register_agent",
  "session_id": "string",
  "type": "master" | "worker",
  "label": "string",
  "config": "string",
  "working_dir": "string",
  "parent_id": "string (可选)"
}
```

**响应：**
```json
{
  "success": true,
  "agent": {
    "sessionId": "...",
    "type": "worker",
    "label": "Worker Agent",
    "status": "idle",
    ...
  }
}
```

### unregister_agent

注销Agent

```json
{
  "action": "unregister_agent",
  "session_id": "string"
}
```

**响应：**
```json
{
  "success": true
}
```

### update_agent_status

更新Agent状态

```json
{
  "action": "update_agent_status",
  "session_id": "string",
  "status": "idle" | "busy" | "error" | "disconnected"
}
```

**响应：**
```json
{
  "success": true,
  "agent": { ... }
}
```

### agent_heartbeat

发送心跳

```json
{
  "action": "agent_heartbeat",
  "session_id": "string"
}
```

**响应：**
```json
{
  "success": true,
  "agent": { ... }
}
```

### get_agent

获取单个Agent

```json
{
  "action": "get_agent",
  "session_id": "string"
}
```

**响应：**
```json
{
  "success": true,
  "agent": { ... }
}
```

### list_agents

查询Agent列表（支持过滤）

```json
{
  "action": "list_agents",
  "type": "master" | "worker" (可选),
  "status": "idle" | "busy" (可选),
  "parent_id": "string" (可选),
  "config": "string" (可选)
}
```

**响应：**
```json
{
  "success": true,
  "agents": [...]
}
```

### get_all_agents

获取所有Agent

```json
{
  "action": "get_all_agents"
}
```

**响应：**
```json
{
  "success": true,
  "agents": [...]
}
```

## Hook使用

### AgentStatus.hook.ts

在会话启动时自动注册Agent，在会话结束时自动注销。

通过环境变量配置：

```bash
export AGENT_TYPE=worker
export AGENT_CONFIG=analyzer-agent
export AGENT_LABEL="My Analyzer"
export AGENT_PARENT_ID=master-session-id
```

### 使用方法

将Hook配置到Claude的hooks配置中：

```json
{
  "session_start": ["AgentStatus.hook.ts"],
  "session_end": ["AgentStatus.hook.ts"]
}
```

## 事件

AgentRegistry会发出以下事件：

- `registered`: 新Agent注册
- `updated`: Agent信息更新
- `unregistered`: Agent注销
- `heartbeat`: 收到心跳

事件格式：

```typescript
{
  type: 'registered' | 'updated' | 'unregistered' | 'heartbeat';
  agent: AgentInfo;
  timestamp: number;
}
```

## 心跳机制

Agent默认心跳超时时间为 **5分钟**（300000毫秒）。

超时的Agent会被自动标记为 `disconnected` 状态。

可以通过修改 `AGENT_TIMEOUT` 常量来调整超时时间。

## 测试

运行手动测试脚本：

```bash
./test/test-agent-registry.sh
```

或直接使用nc测试：

```bash
echo '{"action":"register_agent",...}' | nc -U /tmp/claude-daemon.sock
```
