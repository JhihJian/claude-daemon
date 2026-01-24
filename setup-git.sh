#!/bin/bash
# Claude 会话历史 - Git 仓库初始化脚本

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

SESSIONS_DIR=~/.claude/SESSIONS

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}初始化会话数据 Git 仓库${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""

# 检查目录是否存在
if [ ! -d "$SESSIONS_DIR" ]; then
    echo -e "${RED}错误: $SESSIONS_DIR 不存在${NC}"
    echo -e "${YELLOW}请先运行安装脚本: ./install.sh${NC}"
    exit 1
fi

cd "$SESSIONS_DIR"

# 1. 初始化 Git（如果还没有）
if [ ! -d ".git" ]; then
    echo -e "${GREEN}[1/5] 初始化 Git 仓库...${NC}"
    git init
    echo -e "${GREEN}✓ Git 仓库已初始化${NC}"
else
    echo -e "${YELLOW}⚠ Git 仓库已存在${NC}"
fi
echo ""

# 2. 创建 .gitignore
echo -e "${GREEN}[2/5] 创建 .gitignore...${NC}"
cat > .gitignore << 'EOF'
# 日志文件
*.log

# 临时文件
*.tmp
*.swp
*~

# macOS
.DS_Store

# 排除敏感会话（如果需要）
# **/session-*-sensitive.jsonl
EOF
echo -e "${GREEN}✓ .gitignore 已创建${NC}"
echo ""

# 3. 创建 README
echo -e "${GREEN}[3/5] 创建 README...${NC}"
cat > README.md << 'EOF'
# Claude Code 会话历史数据

这个仓库存储了 Claude Code 的会话历史记录。

## 目录结构

```
.
├── raw/              # 原始会话数据（JSONL格式）
│   └── YYYY-MM/
│       └── session-{id}.jsonl
├── analysis/         # 分析结果
│   ├── summaries/    # 会话摘要
│   ├── by-type/      # 按类型索引
│   └── by-directory/ # 按目录索引
└── index/            # 全局索引
    └── metadata.json
```

## 数据格式

- **原始事件**: JSONL格式，每行一个JSON对象
- **摘要**: JSON格式，包含会话元数据和对话内容

## 隐私

⚠️ 此仓库包含个人会话数据，请确保：
- 仓库设置为私有
- 不要提交包含敏感信息的会话
- 定期清理旧数据

## 同步

在其他电脑上使用：
```bash
git clone <仓库地址> ~/.claude/SESSIONS
```

## 最后同步

- 主机: $(hostname)
- 时间: $(date)
EOF
echo -e "${GREEN}✓ README 已创建${NC}"
echo ""

# 4. 首次提交
echo -e "${GREEN}[4/5] 创建首次提交...${NC}"
git add .
git commit -m "Initial commit: Session history from $(hostname)" || {
    echo -e "${YELLOW}⚠ 可能已经有提交了${NC}"
}
echo ""

# 5. 设置远程仓库
echo -e "${GREEN}[5/5] 配置远程仓库...${NC}"
echo ""
echo -e "${YELLOW}请选择远程仓库类型:${NC}"
echo "  1) GitHub"
echo "  2) GitLab"
echo "  3) 自定义 Git 服务器"
echo "  4) 跳过（稍后手动配置）"
echo ""
read -p "请选择 [1-4]: " choice

case $choice in
    1)
        echo ""
        echo -e "${YELLOW}请在 GitHub 上创建私有仓库: claude-sessions${NC}"
        echo "访问: https://github.com/new"
        echo ""
        read -p "输入您的 GitHub 用户名: " github_user
        REMOTE_URL="git@github.com:$github_user/claude-sessions.git"
        ;;
    2)
        echo ""
        read -p "输入您的 GitLab 用户名: " gitlab_user
        REMOTE_URL="git@gitlab.com:$gitlab_user/claude-sessions.git"
        ;;
    3)
        echo ""
        read -p "输入远程仓库 URL: " REMOTE_URL
        ;;
    4)
        echo -e "${YELLOW}跳过远程配置${NC}"
        REMOTE_URL=""
        ;;
    *)
        echo -e "${RED}无效选择${NC}"
        exit 1
        ;;
esac

if [ -n "$REMOTE_URL" ]; then
    # 检查是否已有 origin
    if git remote | grep -q '^origin$'; then
        echo -e "${YELLOW}移除旧的 origin...${NC}"
        git remote remove origin
    fi

    git remote add origin "$REMOTE_URL"
    git branch -M main

    echo ""
    echo -e "${GREEN}✓ 远程仓库已配置: $REMOTE_URL${NC}"
    echo ""
    echo -e "${YELLOW}现在尝试推送到远程...${NC}"

    if git push -u origin main; then
        echo -e "${GREEN}✓ 推送成功！${NC}"
    else
        echo -e "${RED}✗ 推送失败${NC}"
        echo -e "${YELLOW}请检查:${NC}"
        echo "  1. 远程仓库是否已创建"
        echo "  2. SSH 密钥是否已配置"
        echo "  3. 是否有推送权限"
        echo ""
        echo -e "${YELLOW}手动推送命令:${NC}"
        echo "  git push -u origin main"
    fi
fi

echo ""
echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}✓ Git 仓库初始化完成！${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""
echo -e "${YELLOW}下一步:${NC}"
echo ""
echo "1. 在其他电脑上克隆仓库:"
echo -e "   ${GREEN}git clone $REMOTE_URL ~/.claude/SESSIONS${NC}"
echo ""
echo "2. 设置自动同步（可选）:"
echo -e "   ${GREEN}./setup-auto-sync.sh${NC}"
echo ""
echo "3. 查看同步日志:"
echo -e "   ${GREEN}tail -f ~/.claude/sync.log${NC}"
echo ""
