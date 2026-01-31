# Web UI 使用指南

Claude Code 会话历史可视化界面 - 通过浏览器查看和分析会话数据

## 📊 功能特性

### 核心功能
- **仪表板概览** - 实时统计会话总数、活跃项目、平均时长
- **类型分布** - 饼图展示不同会话类型的占比
- **时间线趋势** - 最近 30 天的会话活跃度折线图
- **会话浏览** - 按类型、目录、时间过滤和搜索
- **详情查看** - 完整的会话元数据、工具使用统计、修改文件列表
- **实时更新** - WebSocket 推送新会话通知

### 支持的过滤器
- 按会话类型（编码/调试/研究/写作/Git/混合）
- 按项目目录
- 自定义显示数量（10/20/50/100）

## 🚀 快速开始

### 方式一：与守护进程集成启动

```bash
# 启动守护进程并启用 Web UI
claude-daemon start --web-ui

# 访问界面
open http://127.0.0.1:3000
```

### 方式二：独立启动（无需守护进程）

```bash
# 进入项目目录
cd /path/to/claude-daemon

# 直接启动 Web 服务器
bun web/server.ts

# 访问界面
open http://127.0.0.1:3000
```

### 自定义端口

```bash
# 使用环境变量指定端口
WEB_PORT=8080 claude-daemon start --web-ui

# 访问
open http://127.0.0.1:8080
```

## 🖥️ 界面说明

### 仪表板
顶部四个统计卡片：
- **总会话数** - 历史累计会话总数
- **活跃项目** - 有会话记录的项目数量
- **平均时长** - 所有会话的平均持续时间
- **总时长** - 累计会话时间

### 图表区域
左侧 - **类型分布饼图**
- 各会话类型的数量占比
- 点击图例可显示/隐藏类型

右侧 - **时间线趋势图**
- 最近 30 天的会话数量变化
- 悬停查看具体日期和数量

### 过滤器
- **会话类型** - 下拉选择特定类型
- **搜索目录** - 输入项目路径快速过滤
- **显示数量** - 控制列表显示条数
- **重置按钮** - 一键清空所有过滤条件

### 会话列表
每个会话卡片显示：
- 会话类型标签（带颜色区分）
- 时间（相对时间，如"2 小时前"）
- 主机名
- 工作目录
- Git 仓库和分支（如果有）
- 时长、工具数、成功率

点击卡片查看详情。

### 会话详情弹窗
- **基本信息** - ID、时间、类型、时长
- **工具使用统计** - 各工具调用次数
- **修改的文件** - 文件路径列表
- **会话摘要** - 自动生成的描述

## 🔌 API 端点

Web UI 基于 RESTful API 构建，你也可以直接调用：

### 会话查询
```bash
# 获取最近的会话
curl http://127.0.0.1:3000/api/sessions/recent?limit=10

# 按类型查询
curl http://127.0.0.1:3000/api/sessions/by-type?type=coding

# 按目录查询
curl "http://127.0.0.1:3000/api/sessions/by-directory?directory=/path/to/project"

# 按主机名查询
curl http://127.0.0.1:3000/api/sessions/by-host?hostname=myhost

# 按 ID 查询单个会话
curl http://127.0.0.1:3000/api/sessions/{session-id}
```

### 统计数据
```bash
# 全局统计
curl http://127.0.0.1:3000/api/stats/global

# 类型分布
curl http://127.0.0.1:3000/api/stats/types

# 最活跃目录
curl http://127.0.0.1:3000/api/stats/directories?limit=10

# 时间线（最近 N 天）
curl http://127.0.0.1:3000/api/stats/timeline?days=30
```

### 健康检查
```bash
curl http://127.0.0.1:3000/api/health
```

### WebSocket
```javascript
const ws = new WebSocket('ws://127.0.0.1:3000/ws');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'session_update') {
    console.log('新会话:', data.data);
  }
};
```

## ⚙️ 配置

### 环境变量
```bash
# Web 服务器端口
export WEB_PORT=3000

# 主机绑定（默认 127.0.0.1，仅本地访问）
export WEB_HOST=127.0.0.1

# 数据目录
export PAI_DIR=~/.claude
```

### 安全建议
⚠️ **重要**: Web UI 仅在本地运行，默认只监听 `127.0.0.1`。

**不要**：
- 将 Web UI 暴露到公网
- 使用 `0.0.0.0` 绑定（除非在隔离环境）
- 在生产环境中禁用防火墙

**原因**：
- 会话数据包含敏感信息（文件路径、项目结构）
- 无内置身份验证

如果需要远程访问，建议使用 SSH 隧道：
```bash
# 在远程服务器
claude-daemon start --web-ui

# 在本地机器
ssh -L 3000:127.0.0.1:3000 user@remote-host

# 本地访问
open http://127.0.0.1:3000
```

## 🎨 技术栈

- **后端**: Bun.serve (内置 Web 服务器)
- **前端**: Vue 3 (CDN)
- **样式**: TailwindCSS (CDN)
- **图表**: Chart.js
- **通信**: REST API + WebSocket

## 🐛 故障排除

### Web UI 无法访问
```bash
# 检查守护进程是否运行
claude-daemon status

# 检查端口是否被占用
lsof -i:3000

# 查看日志
claude-daemon logs -f
```

### 数据未显示
```bash
# 确认数据目录存在
ls ~/.claude/SESSIONS/

# 检查是否有会话数据
ls ~/.claude/SESSIONS/analysis/summaries/

# 重新启动守护进程
claude-daemon restart --web-ui
```

### WebSocket 连接失败
- 确保守护进程正在运行
- 检查浏览器控制台错误信息
- 验证防火墙设置

## 📈 性能

- **启动时间**: < 1 秒
- **内存占用**: ~30MB（独立运行）
- **响应时间**: < 10ms（本地）
- **并发支持**: 50+ 同时连接

## 🔄 更新

更新到最新版本：
```bash
# 停止守护进程
claude-daemon stop

# 拉取最新代码
git pull

# 重新启动
claude-daemon start --web-ui
```

## 📞 反馈

遇到问题或建议？
- GitHub Issues: https://github.com/JhihJian/claude-daemon/issues
- 查看日志: `claude-daemon logs -f`

---

**提示**: Web UI 是可选功能，不启用时不会占用任何资源。CLI 工具仍然可以正常使用。
