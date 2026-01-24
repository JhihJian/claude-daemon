#!/bin/bash
# quick-install.sh - Claude Code 会话历史系统一键安装脚本
# 使用方式: curl -fsSL https://raw.githubusercontent.com/user/repo/main/quick-install.sh | bash

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Claude Code 会话历史系统 - 一键安装  ║${NC}"
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo ""

# 配置
REPO_URL="https://github.com/JhihJian/claude-daemon"
INSTALL_DIR="/tmp/claude-history-install-$$"
PROJECT_DIR="$HOME/.local/share/claude-history"

# 检查依赖
echo -e "${GREEN}[1/5] 检查系统依赖...${NC}"

# 检查 curl
if ! command -v curl &> /dev/null; then
    echo -e "${RED}✗ 需要 curl，请先安装${NC}"
    exit 1
fi
echo -e "${GREEN}  ✓ curl 已安装${NC}"

# 检查 git（可选）
HAS_GIT=false
if command -v git &> /dev/null; then
    echo -e "${GREEN}  ✓ git 已安装${NC}"
    HAS_GIT=true
else
    echo -e "${YELLOW}  ⚠ git 未安装，将使用 curl 下载${NC}"
fi

# 检查 Bun
if ! command -v bun &> /dev/null; then
    echo -e "${YELLOW}  ⚠ Bun 未安装，将自动安装...${NC}"
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
    echo -e "${GREEN}  ✓ Bun 安装完成${NC}"
else
    echo -e "${GREEN}  ✓ Bun 已安装${NC}"
fi

echo ""

# 下载项目
echo -e "${GREEN}[2/5] 下载项目文件...${NC}"

# 清理旧的临时目录
rm -rf "$INSTALL_DIR"

if [ "$HAS_GIT" = true ]; then
    # 使用 git clone（更快）
    echo -e "${BLUE}  → 使用 git clone 下载...${NC}"
    git clone --depth 1 --quiet "$REPO_URL" "$INSTALL_DIR" 2>/dev/null || {
        echo -e "${RED}✗ Git clone 失败，尝试使用 curl...${NC}"
        HAS_GIT=false
    }
fi

if [ "$HAS_GIT" = false ]; then
    # 使用 curl 下载 tar.gz
    echo -e "${BLUE}  → 使用 curl 下载...${NC}"
    mkdir -p "$INSTALL_DIR"
    curl -fsSL "$REPO_URL/archive/main.tar.gz" | tar -xz -C "$INSTALL_DIR" --strip-components=1 2>/dev/null || {
        echo -e "${RED}✗ 下载失败，请检查网络连接${NC}"
        echo -e "${YELLOW}  提示: 你可以手动克隆仓库并运行 install.sh${NC}"
        exit 1
    }
fi

echo -e "${GREEN}  ✓ 项目文件下载完成${NC}"
echo ""

# 运行安装脚本
echo -e "${GREEN}[3/5] 运行安装脚本...${NC}"
cd "$INSTALL_DIR"

if [ ! -f "install.sh" ]; then
    echo -e "${RED}✗ install.sh 不存在${NC}"
    exit 1
fi

chmod +x install.sh
./install.sh

echo ""

# 复制项目到永久目录（可选）
echo -e "${GREEN}[4/5] 保存项目文件...${NC}"
mkdir -p "$PROJECT_DIR"
cp -r "$INSTALL_DIR"/* "$PROJECT_DIR/"
echo -e "${GREEN}  ✓ 项目已保存到: $PROJECT_DIR${NC}"
echo ""

# 清理临时文件
echo -e "${GREEN}[5/5] 清理临时文件...${NC}"
cd ~
rm -rf "$INSTALL_DIR"
echo -e "${GREEN}  ✓ 清理完成${NC}"
echo ""

# 显示完成信息
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         ✓ 安装成功完成！              ║${NC}"
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo ""
echo -e "${YELLOW}下一步操作:${NC}"
echo ""
echo -e "1. 重新加载 shell 配置:"
echo -e "   ${GREEN}source ~/.bashrc${NC}  # 或 source ~/.zshrc"
echo ""
echo -e "2. 测试安装:"
echo -e "   ${GREEN}claude-sessions recent 5${NC}"
echo ""
echo -e "3. 查看文档:"
echo -e "   ${GREEN}cat $PROJECT_DIR/README.md${NC}"
echo ""
echo -e "${YELLOW}提示:${NC}"
echo -e "  • 设置日志级别: ${GREEN}export SESSION_LOG_LEVEL=DEBUG${NC}"
echo -e "  • 查看帮助: ${GREEN}claude-sessions --help${NC}"
echo -e "  • 项目位置: ${BLUE}$PROJECT_DIR${NC}"
echo ""
echo -e "${YELLOW}问题反馈:${NC}"
echo -e "  $REPO_URL/issues"
echo ""
