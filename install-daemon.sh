#!/bin/bash
# Claude Daemon 安装脚本（守护进程版本）

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║ Claude Code Daemon - 守护进程安装      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# 获取脚本所在目录
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
echo -e "${YELLOW}安装源目录: $SCRIPT_DIR${NC}"
echo ""

# 1. 检查 Bun
echo -e "${GREEN}[1/8] 检查 Bun 运行时...${NC}"
if command -v bun &> /dev/null; then
    BUN_PATH=$(which bun)
    echo -e "${GREEN}✓ Bun 已安装: $BUN_PATH${NC}"
else
    echo -e "${YELLOW}⚠ Bun 未安装，正在安装...${NC}"
    curl -fsSL https://bun.sh/install | bash

    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"

    BUN_PATH="$HOME/.bun/bin/bun"
    echo -e "${GREEN}✓ Bun 安装完成: $BUN_PATH${NC}"
fi
echo ""

# 2. 创建目录结构
echo -e "${GREEN}[2/8] 创建目录结构...${NC}"
mkdir -p ~/.claude/SESSIONS/raw
mkdir -p ~/.claude/SESSIONS/analysis/summaries
mkdir -p ~/.claude/SESSIONS/analysis/by-type
mkdir -p ~/.claude/SESSIONS/analysis/by-directory
mkdir -p ~/.claude/SESSIONS/index
mkdir -p ~/.claude/hooks
mkdir -p ~/.claude/daemon
mkdir -p ~/.claude/lib
mkdir -p ~/.claude/tools

chmod 700 ~/.claude/SESSIONS
chmod -R 700 ~/.claude/SESSIONS/*
chmod 700 ~/.claude/hooks
chmod 700 ~/.claude/daemon

echo -e "${GREEN}✓ 目录创建完成${NC}"
echo ""

# 3. 安装守护进程文件
echo -e "${GREEN}[3/8] 安装守护进程文件...${NC}"

# 复制守护进程核心文件
cp -r "$SCRIPT_DIR/daemon"/* ~/.claude/daemon/
chmod -R 700 ~/.claude/daemon

# 复制共享库文件
cp -r "$SCRIPT_DIR/lib"/* ~/.claude/lib/
chmod -R 700 ~/.claude/lib

echo -e "${GREEN}✓ 守护进程文件安装完成${NC}"
echo ""

# 4. 安装 Hooks（推送模式）
echo -e "${GREEN}[4/8] 安装 Hooks（推送模式）...${NC}"

for hook in "$SCRIPT_DIR/hooks-push"/*.ts; do
    if [ -f "$hook" ]; then
        hook_name=$(basename "$hook")
        target_hook=~/.claude/hooks/"$hook_name"

        cp "$hook" "$target_hook"
        chmod 700 "$target_hook"

        echo -e "${GREEN}  ✓ $hook_name${NC}"
    fi
done
echo ""

# 5. 安装管理工具
echo -e "${GREEN}[5/8] 安装管理工具...${NC}"

mkdir -p ~/bin
cp "$SCRIPT_DIR/bin/claude-daemon" ~/bin/claude-daemon
chmod +x ~/bin/claude-daemon

# 添加到 PATH
if [[ ":$PATH:" != *":$HOME/bin:"* ]]; then
    echo 'export PATH="$HOME/bin:$PATH"' >> ~/.bashrc
    echo -e "${YELLOW}  已添加 ~/bin 到 PATH（请运行 source ~/.bashrc）${NC}"
fi

echo -e "${GREEN}✓ 管理工具安装完成${NC}"
echo ""

# 6. 配置 Claude Code settings
echo -e "${GREEN}[6/8] 配置 Claude Code...${NC}"
SETTINGS_FILE=~/.claude/settings.json

if [ -f "$SETTINGS_FILE" ]; then
    echo -e "${YELLOW}⚠ settings.json 已存在，备份到 settings.json.backup${NC}"
    cp "$SETTINGS_FILE" "$SETTINGS_FILE.backup"
fi

cat > "$SETTINGS_FILE" <<EOF
{
  "model": "opus",
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$HOME/.claude/hooks/SessionRecorder.hook.ts"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$HOME/.claude/hooks/SessionToolCapture.hook.ts"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$HOME/.claude/hooks/SessionAnalyzer.hook.ts"
          }
        ]
      }
    ]
  }
}
EOF

echo -e "${GREEN}✓ Claude Code 配置完成${NC}"
echo ""

# 7. 配置系统服务（可选）
echo -e "${GREEN}[7/8] 配置系统服务（可选）...${NC}"

if command -v systemctl &> /dev/null; then
    # Linux with systemd
    echo -e "${YELLOW}检测到 systemd，是否配置为系统服务？(y/n)${NC}"
    read -r answer

    if [ "$answer" = "y" ]; then
        mkdir -p ~/.config/systemd/user
        cp "$SCRIPT_DIR/systemd/claude-daemon@.service" ~/.config/systemd/user/

        # 替换用户名
        sed -i "s/%i/$USER/g" ~/.config/systemd/user/claude-daemon@.service
        sed -i "s/%h/$HOME/g" ~/.config/systemd/user/claude-daemon@.service

        systemctl --user daemon-reload
        systemctl --user enable claude-daemon@$USER.service

        echo -e "${GREEN}✓ systemd 服务已配置${NC}"
        echo -e "${YELLOW}  使用 'systemctl --user start claude-daemon@$USER' 启动${NC}"
    else
        echo -e "${YELLOW}跳过 systemd 配置${NC}"
    fi
elif [ "$(uname)" = "Darwin" ]; then
    # macOS with launchd
    echo -e "${YELLOW}检测到 macOS，是否配置为启动项？(y/n)${NC}"
    read -r answer

    if [ "$answer" = "y" ]; then
        cp "$SCRIPT_DIR/launchd/com.claudecode.daemon.plist" ~/Library/LaunchAgents/

        # 替换用户路径
        sed -i '' "s|/Users/USER|$HOME|g" ~/Library/LaunchAgents/com.claudecode.daemon.plist

        launchctl load ~/Library/LaunchAgents/com.claudecode.daemon.plist

        echo -e "${GREEN}✓ launchd 配置已完成${NC}"
        echo -e "${YELLOW}  守护进程将在登录时自动启动${NC}"
    else
        echo -e "${YELLOW}跳过 launchd 配置${NC}"
    fi
else
    echo -e "${YELLOW}未检测到 systemd 或 launchd，请手动启动守护进程${NC}"
fi
echo ""

# 8. 启动守护进程
echo -e "${GREEN}[8/8] 启动守护进程...${NC}"

# 确保 PATH 包含 ~/bin
export PATH="$HOME/bin:$PATH"

# 启动守护进程
if command -v claude-daemon &> /dev/null; then
    claude-daemon start
    echo -e "${GREEN}✓ 守护进程已启动${NC}"
else
    echo -e "${YELLOW}请运行 'source ~/.bashrc' 后再执行 'claude-daemon start'${NC}"
fi
echo ""

# 安装完成
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        安装完成！                       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}下一步操作：${NC}"
echo ""
echo -e "  1. 重新加载 shell 配置:"
echo -e "     ${YELLOW}source ~/.bashrc${NC}"
echo ""
echo -e "  2. 管理守护进程:"
echo -e "     ${YELLOW}claude-daemon start${NC}   - 启动守护进程"
echo -e "     ${YELLOW}claude-daemon stop${NC}    - 停止守护进程"
echo -e "     ${YELLOW}claude-daemon status${NC}  - 查看状态"
echo -e "     ${YELLOW}claude-daemon logs${NC}    - 查看日志"
echo ""
echo -e "  3. 测试 Claude Code:"
echo -e "     ${YELLOW}echo '测试守护进程' | claude${NC}"
echo ""
echo -e "  4. 查询会话历史:"
echo -e "     ${YELLOW}claude-sessions recent 5${NC}"
echo ""
