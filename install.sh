#!/bin/bash
# Claude Code 会话历史系统 - 一键安装脚本
# 支持在任何电脑上快速部署

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}Claude Code 会话历史系统 - 安装程序${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""

# 检测系统
OS=$(uname -s)
echo -e "${YELLOW}检测到系统: $OS${NC}"

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

    # 添加到当前 shell
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"

    BUN_PATH="$HOME/.bun/bin/bun"
    echo -e "${GREEN}✓ Bun 安装完成: $BUN_PATH${NC}"
fi
echo ""

# 2. 创建目录结构（设置安全权限）
echo -e "${GREEN}[2/8] 创建目录结构...${NC}"
mkdir -p ~/.claude/SESSIONS/raw
mkdir -p ~/.claude/SESSIONS/analysis/summaries
mkdir -p ~/.claude/SESSIONS/analysis/by-type
mkdir -p ~/.claude/SESSIONS/analysis/by-directory
mkdir -p ~/.claude/SESSIONS/index
mkdir -p ~/.claude/hooks

# 设置目录权限：700（仅所有者可访问）
chmod 700 ~/.claude/SESSIONS
chmod -R 700 ~/.claude/SESSIONS/*
chmod 700 ~/.claude/hooks

echo -e "${GREEN}✓ 目录创建完成（权限：700）${NC}"
echo ""

# 3. 复制共享库（hooks 依赖）
echo -e "${GREEN}[3/8] 安装共享库...${NC}"

# 创建 lib 目录
mkdir -p ~/.claude/lib

# 复制 lib 文件到用户目录
if [ -d "$SCRIPT_DIR/lib" ]; then
    cp "$SCRIPT_DIR/lib"/*.ts ~/.claude/lib/ 2>/dev/null || true
    if [ -f ~/.claude/lib/logger.ts ]; then
        echo -e "${GREEN}  ✓ logger.ts${NC}"
    fi
    if [ -f ~/.claude/lib/errors.ts ]; then
        echo -e "${GREEN}  ✓ errors.ts${NC}"
    fi
    if [ -f ~/.claude/lib/config.ts ]; then
        echo -e "${GREEN}  ✓ config.ts${NC}"
    fi
else
    echo -e "${YELLOW}  ⚠ lib 目录不存在，跳过${NC}"
fi
echo ""

# 4. 配置 hooks（使用 #!/usr/bin/env bun）
echo -e "${GREEN}[4/8] 配置 hooks...${NC}"
for hook in "$SCRIPT_DIR/hooks"/*.ts; do
    if [ -f "$hook" ]; then
        hook_name=$(basename "$hook")
        target_hook=~/.claude/hooks/"$hook_name"

        # 直接复制文件（保留 #!/usr/bin/env bun）
        cp "$hook" "$target_hook"

        # 设置权限：700（仅所有者可读写执行）
        chmod 700 "$target_hook"

        echo -e "${GREEN}  ✓ $hook_name${NC}"
    fi
done
echo ""

# 5. 配置 Claude Code settings
echo -e "${GREEN}[5/8] 配置 Claude Code...${NC}"
SETTINGS_FILE=~/.claude/settings.json

if [ -f "$SETTINGS_FILE" ]; then
    echo -e "${YELLOW}⚠ settings.json 已存在，备份到 settings.json.backup${NC}"
    cp "$SETTINGS_FILE" "$SETTINGS_FILE.backup"
fi

# 创建或更新 settings.json
cat > "$SETTINGS_FILE" << EOF
{
  "model": "opus",
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$HOME/.claude/hooks/SessionRecorder.hook.ts"
          },
          {
            "type": "command",
            "command": "$HOME/.claude/hooks/SessionTracker.hook.ts"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$HOME/.claude/hooks/SessionToolCapture-v2.hook.ts"
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
          },
          {
            "type": "command",
            "command": "$HOME/.claude/hooks/SessionTracker.hook.ts"
          }
        ]
      }
    ]
  }
}
EOF

echo -e "${GREEN}✓ settings.json 配置完成${NC}"
echo ""

# 6. 安装查询工具（复制到用户目录，独立于 npm 包）
echo -e "${GREEN}[6/8] 安装查询工具...${NC}"

# 创建 tools 目录
mkdir -p ~/.claude/tools

# 复制 tools 文件到用户目录
if [ -d "$SCRIPT_DIR/tools" ]; then
    cp -r "$SCRIPT_DIR/tools"/* ~/.claude/tools/
    echo -e "${GREEN}  ✓ 工具文件已复制到 ~/.claude/tools/${NC}"
else
    echo -e "${RED}  ✗ 找不到 tools 目录${NC}"
    exit 1
fi

# 创建查询工具的包装脚本
mkdir -p ~/bin

cat > ~/bin/claude-sessions << EOF
#!/bin/bash
# Claude 会话历史查询工具
# 此脚本引用 ~/.claude/tools/ 中的文件，独立于 npm 包

BUN_PATH="$BUN_PATH"
TOOLS_DIR="\$HOME/.claude/tools"

# 检查工具是否存在
if [ ! -f "\$TOOLS_DIR/SessionQuery.ts" ]; then
    echo -e "\033[0;31m错误: 找不到查询工具\033[0m"
    echo -e "\033[1;33m路径: \$TOOLS_DIR/SessionQuery.ts\033[0m"
    echo -e "\033[1;33m请重新运行安装: npx @jhihjian/claude-daemon install\033[0m"
    exit 1
fi

case "\$1" in
  recent|type|dir|host)
    \$BUN_PATH \$TOOLS_DIR/SessionQuery.ts "\$@"
    ;;
  stats)
    shift
    \$BUN_PATH \$TOOLS_DIR/SessionStats.ts "\$@"
    ;;
  show)
    \$TOOLS_DIR/show-conversation.sh "\$2"
    ;;
  *)
    echo ""
    echo -e "\033[0;36mClaude Code 会话历史查询工具\033[0m"
    echo ""
    echo -e "\033[1;33m用法:\033[0m"
    echo "  claude-sessions recent [N]       - 查看最近 N 个会话"
    echo "  claude-sessions type <类型>      - 查看指定类型的会话"
    echo "  claude-sessions dir <目录>       - 查看指定目录的会话"
    echo "  claude-sessions host <主机名>    - 查看指定主机的会话"
    echo "  claude-sessions stats <类型>     - 查看统计信息"
    echo ""
    echo -e "\033[1;33m示例:\033[0m"
    echo "  claude-sessions recent 5"
    echo "  claude-sessions type coding"
    echo "  claude-sessions stats global"
    echo ""
    echo "会话类型: coding, debugging, research, writing, git, mixed"
    echo "统计类型: global, types, dirs"
    echo ""
    ;;
esac
EOF

chmod +x ~/bin/claude-sessions
echo -e "${GREEN}✓ 查询工具安装完成${NC}"
echo ""

# 7. 添加到 PATH
echo -e "${GREEN}[7/8] 配置环境变量...${NC}"

# 检测 shell
if [ -n "$ZSH_VERSION" ]; then
    SHELL_RC=~/.zshrc
elif [ -n "$BASH_VERSION" ]; then
    SHELL_RC=~/.bashrc
else
    SHELL_RC=~/.profile
fi

# 添加 PATH
if ! grep -q "export PATH=\"\$HOME/bin:\$PATH\"" "$SHELL_RC"; then
    echo "" >> "$SHELL_RC"
    echo "# Claude 会话历史工具" >> "$SHELL_RC"
    echo "export PATH=\"\$HOME/bin:\$PATH\"" >> "$SHELL_RC"
    echo -e "${GREEN}✓ 已添加到 $SHELL_RC${NC}"
else
    echo -e "${GREEN}✓ PATH 已配置${NC}"
fi

echo ""

# 8. 验证安装
echo -e "${GREEN}[8/8] 验证安装...${NC}"

# 检查 Bun 是否在 PATH 中
if command -v bun &> /dev/null; then
    echo -e "${GREEN}  ✓ Bun 在 PATH 中${NC}"
else
    echo -e "${YELLOW}  ⚠ Bun 不在 PATH 中，hooks 可能无法执行${NC}"
    echo -e "${YELLOW}    请确保 ~/.bun/bin 在 PATH 中${NC}"
fi

# 检查 hooks 是否可执行
hooks_ok=true
for hook_name in SessionRecorder.hook.ts SessionToolCapture-v2.hook.ts SessionAnalyzer.hook.ts; do
    hook_file=~/.claude/hooks/$hook_name
    if [ -x "$hook_file" ]; then
        echo -e "${GREEN}  ✓ $hook_name 可执行${NC}"
    else
        echo -e "${RED}  ✗ $hook_name 不可执行${NC}"
        hooks_ok=false
    fi
done

# 检查目录权限
if [ -d ~/.claude/SESSIONS ] && [ "$(stat -c %a ~/.claude/SESSIONS 2>/dev/null || stat -f %A ~/.claude/SESSIONS 2>/dev/null)" = "700" ]; then
    echo -e "${GREEN}  ✓ 目录权限正确（700）${NC}"
else
    echo -e "${YELLOW}  ⚠ 目录权限可能不正确${NC}"
fi

# 检查 lib 目录（已复制到用户目录）
if [ -d ~/.claude/lib ] && [ -f ~/.claude/lib/logger.ts ]; then
    echo -e "${GREEN}  ✓ lib 目录已安装${NC}"
else
    echo -e "${RED}  ✗ lib 目录不存在或不完整${NC}"
    hooks_ok=false
fi

# 检查 tools 目录（已复制到用户目录）
if [ -d ~/.claude/tools ] && [ -f ~/.claude/tools/SessionQuery.ts ]; then
    echo -e "${GREEN}  ✓ tools 目录已安装${NC}"
else
    echo -e "${RED}  ✗ tools 目录不存在或不完整${NC}"
    hooks_ok=false
fi

echo ""

if [ "$hooks_ok" = true ]; then
    echo -e "${GREEN}======================================${NC}"
    echo -e "${GREEN}✓ 安装完成！${NC}"
    echo -e "${GREEN}======================================${NC}"
else
    echo -e "${YELLOW}======================================${NC}"
    echo -e "${YELLOW}⚠ 安装完成，但有警告${NC}"
    echo -e "${YELLOW}======================================${NC}"
fi

echo ""
echo -e "${YELLOW}安装位置:${NC}"
echo -e "  Hooks:   ~/.claude/hooks/"
echo -e "  Lib:     ~/.claude/lib/"
echo -e "  Tools:   ~/.claude/tools/"
echo -e "  数据:    ~/.claude/SESSIONS/"
echo -e "  命令:    ~/bin/claude-sessions"
echo ""
echo -e "${YELLOW}使用方法:${NC}"
echo ""
echo -e "  ${GREEN}claude-sessions recent 5${NC}      # 查看最近 5 个会话"
echo -e "  ${GREEN}claude-sessions stats global${NC}  # 查看统计信息"
echo -e "  ${GREEN}claude-sessions show <ID>${NC}     # 查看会话详情"
echo ""
echo -e "${YELLOW}重要提示:${NC}"
echo -e "  1. 重新加载 shell 配置: ${GREEN}source $SHELL_RC${NC}"
echo -e "  2. 或者重启终端"
echo -e "  3. 即使卸载 npm 包，查询工具仍然可用"
echo -e "  4. 设置日志级别: ${GREEN}export SESSION_LOG_LEVEL=DEBUG${NC}"
echo ""
