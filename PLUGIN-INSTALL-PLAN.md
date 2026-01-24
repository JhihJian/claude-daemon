# Claude Code 会话历史系统 - 插件化安装方案

## 当前安装方式的问题

1. 需要手动克隆/下载项目
2. 需要运行 install.sh 脚本
3. 步骤较多，不够便捷

## 可行的一键安装方案

### 方案 1: curl | bash 安装（推荐）

**优点**：
- 最简单，一行命令完成
- 类似 Bun、Homebrew 的安装方式
- 用户体验最好

**实现方式**：
```bash
curl -fsSL https://raw.githubusercontent.com/user/claude-history/main/install.sh | bash
```

**需要做的改进**：
1. 将项目发布到 GitHub
2. 修改 install.sh，使其能够：
   - 自动下载项目文件
   - 自动安装到正确位置
   - 自动配置

---

### 方案 2: npm/bun 包管理器

**优点**：
- 标准化的包管理
- 支持版本管理和更新
- 可以发布到 npm registry

**实现方式**：
```bash
# 使用 npm
npx @username/claude-history install

# 或使用 bun
bunx @username/claude-history install
```

**需要做的工作**：
1. 创建 package.json
2. 添加 bin 脚本
3. 发布到 npm

---

### 方案 3: GitHub Release + 安装脚本

**优点**：
- 不依赖 npm
- 可以提供多个版本
- 支持自动更新

**实现方式**：
```bash
bash <(curl -fsSL https://install.claude-history.dev)
```

**需要做的工作**：
1. 创建专门的安装服务器或使用 GitHub Pages
2. 提供版本选择
3. 实现自动更新机制

---

## 推荐实现方案

### 阶段 1: 改进现有 install.sh（立即可做）

**目标**：让 install.sh 能够自动下载和安装

**改进点**：
1. 检测是否在项目目录中
2. 如果不在，自动从 GitHub 下载
3. 自动清理临时文件

**使用方式**：
```bash
curl -fsSL https://raw.githubusercontent.com/user/repo/main/quick-install.sh | bash
```

---

### 阶段 2: 创建 npm 包（中期）

**目标**：通过 npm/bun 包管理器安装

**package.json 结构**：
```json
{
  "name": "@username/claude-history",
  "version": "1.1.0",
  "bin": {
    "claude-history-install": "./bin/install.js"
  },
  "files": [
    "hooks/",
    "lib/",
    "tools/",
    "install.sh"
  ]
}
```

**使用方式**：
```bash
npx @username/claude-history install
```

---

### 阶段 3: 自动更新机制（长期）

**目标**：自动检测和更新

**功能**：
- 检测新版本
- 一键更新
- 保留用户配置

**使用方式**：
```bash
claude-history update
```

---

## 立即可实现的方案

### 创建 quick-install.sh

这是一个独立的安装脚本，可以直接通过 curl 执行：

```bash
#!/bin/bash
# quick-install.sh - 一键安装 Claude Code 会话历史系统

set -e

REPO_URL="https://github.com/username/claude-history"
INSTALL_DIR="/tmp/claude-history-install"

echo "🚀 开始安装 Claude Code 会话历史系统..."

# 1. 下载项目
echo "📦 下载项目文件..."
if command -v git &> /dev/null; then
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
else
    curl -fsSL "$REPO_URL/archive/main.tar.gz" | tar -xz -C /tmp
    mv /tmp/claude-history-main "$INSTALL_DIR"
fi

# 2. 运行安装脚本
cd "$INSTALL_DIR"
./install.sh

# 3. 清理
cd ~
rm -rf "$INSTALL_DIR"

echo "✅ 安装完成！"
```

**使用方式**：
```bash
curl -fsSL https://raw.githubusercontent.com/user/repo/main/quick-install.sh | bash
```

---

## Claude Code 官方插件机制

### 当前状态
Claude Code 目前**没有**官方的插件市场或插件管理系统。

### 现有机制
- **Hooks 系统**：可以在特定事件触发时执行脚本
- **MCP Servers**：Model Context Protocol 服务器
- **Settings.json**：手动配置

### 未来可能性
如果 Claude Code 未来推出插件市场，我们可以：
1. 将项目打包为标准插件格式
2. 提交到插件市场
3. 用户可以在 Claude Code 内一键安装

---

## 建议的实施步骤

### 第 1 步：创建 quick-install.sh（本周）
- 编写独立的安装脚本
- 支持从 GitHub 下载
- 自动运行 install.sh

### 第 2 步：发布到 GitHub（本周）
- 创建 GitHub 仓库
- 添加 README 和文档
- 设置 GitHub Pages

### 第 3 步：创建 npm 包（下周）
- 编写 package.json
- 创建 bin 脚本
- 发布到 npm

### 第 4 步：添加更新机制（未来）
- 版本检测
- 自动更新
- 配置迁移

---

## 总结

**可以做成一键安装**，推荐的方式是：

1. **短期**：创建 `quick-install.sh`，通过 `curl | bash` 安装
2. **中期**：发布 npm 包，通过 `npx` 安装
3. **长期**：等待 Claude Code 官方插件机制

**最简单的实现**（立即可用）：
```bash
curl -fsSL https://your-domain.com/install.sh | bash
```

这种方式用户只需要一行命令就能完成安装！
