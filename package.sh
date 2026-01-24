#!/bin/bash
# Claude 会话历史系统 - 打包脚本
# 将系统打包成一个文件，方便传输到其他电脑

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
OUTPUT_FILE="claude-history-system-$(date +%Y%m%d).tar.gz"

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}打包 Claude 会话历史系统${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""

cd "$SCRIPT_DIR/.."

echo -e "${YELLOW}正在打包...${NC}"

# 打包系统文件（不包括数据）
tar -czf "$OUTPUT_FILE" \
    --exclude='.git' \
    --exclude='*.log' \
    --exclude='node_modules' \
    claude-history/

echo -e "${GREEN}✓ 打包完成！${NC}"
echo ""
echo -e "${YELLOW}输出文件:${NC} $(pwd)/$OUTPUT_FILE"
echo -e "${YELLOW}文件大小:${NC} $(du -h "$OUTPUT_FILE" | cut -f1)"
echo ""
echo -e "${GREEN}在其他电脑上使用:${NC}"
echo ""
echo "1. 传输文件:"
echo -e "   ${GREEN}scp $OUTPUT_FILE user@target-computer:/tmp/${NC}"
echo ""
echo "2. 解压并安装:"
echo -e "   ${GREEN}cd /tmp && tar -xzf $OUTPUT_FILE${NC}"
echo -e "   ${GREEN}cd claude-history && ./install.sh${NC}"
echo ""
