# Claude OpenAI Proxy Plugin

OpenAI API 兼容的代理插件，为 Claude Code 提供 HTTP 接口。

## 功能

- ✅ OpenAI API 兼容的 `/v1/chat/completions` 端点
- ✅ SSE 流式响应
- ✅ Claude Code 进程池管理
- ✅ 会话管理
- ✅ 健康检查端点

## 安装

1. 确保 Claude Daemon 已安装并运行
2. 配置插件：

```json
{
  "plugins": [
    {
      "name": "openai-proxy",
      "path": "/path/to/plugins/claude-openai-proxy",
      "enabled": true,
      "config": {
        "port": 3002,
        "host": "127.0.0.1",
        "maxProcesses": 10,
        "processTimeout": 300000
      }
    }
  ]
}
```

3. 重启 daemon：

```bash
claude-daemon restart
```

## 使用

### 基本请求

```bash
curl http://localhost:3002/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "system", "content": "You are a helpful assistant"},
      {"role": "user", "content": "Hello!"}
    ],
    "stream": true
  }'
```

### 健康检查

```bash
curl http://localhost:3002/health
```

## 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `port` | number | 3002 | HTTP 服务器端口 |
| `host` | string | 127.0.0.1 | HTTP 服务器主机 |
| `maxProcesses` | number | 10 | 最大进程数 |
| `processTimeout` | number | 300000 | 进程超时时间（毫秒） |

## 架构

```
HTTP Request → HTTPServer → ProcessManager → Claude Code Process
                                ↓
                          SSE Response
```

## 开发

```bash
# 安装依赖
bun install

# 开发模式
bun run dev

# 测试
bun test
```

## License

MIT
