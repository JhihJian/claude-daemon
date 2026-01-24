#!/bin/bash
# Claude 会话历史 - 自动同步设置脚本

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SYNC_SCRIPT="$SCRIPT_DIR/sync-git.sh"

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}设置自动同步${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""

# 检查同步脚本是否存在
if [ ! -f "$SYNC_SCRIPT" ]; then
    echo -e "${RED}错误: 找不到同步脚本 $SYNC_SCRIPT${NC}"
    exit 1
fi

chmod +x "$SYNC_SCRIPT"

echo -e "${YELLOW}选择同步频率:${NC}"
echo "  1) 每小时"
echo "  2) 每4小时"
echo "  3) 每天"
echo "  4) 自定义"
echo ""
read -p "请选择 [1-4]: " choice

case $choice in
    1)
        CRON_SCHEDULE="0 * * * *"
        DESC="每小时"
        ;;
    2)
        CRON_SCHEDULE="0 */4 * * *"
        DESC="每4小时"
        ;;
    3)
        CRON_SCHEDULE="0 2 * * *"
        DESC="每天凌晨2点"
        ;;
    4)
        echo ""
        echo "Cron 格式: 分 时 日 月 周"
        echo "示例: 0 */2 * * * (每2小时)"
        read -p "输入 cron 表达式: " CRON_SCHEDULE
        DESC="自定义"
        ;;
    *)
        echo -e "${RED}无效选择${NC}"
        exit 1
        ;;
esac

# 添加到 crontab
CRON_LINE="$CRON_SCHEDULE $SYNC_SCRIPT >> ~/.claude/sync.log 2>&1"

# 检查是否已存在
if crontab -l 2>/dev/null | grep -q "$SYNC_SCRIPT"; then
    echo -e "${YELLOW}⚠ 已存在同步任务，正在更新...${NC}"
    (crontab -l 2>/dev/null | grep -v "$SYNC_SCRIPT"; echo "$CRON_LINE") | crontab -
else
    (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
fi

echo ""
echo -e "${GREEN}✓ 自动同步已设置！${NC}"
echo ""
echo -e "${YELLOW}同步频率:${NC} $DESC"
echo -e "${YELLOW}日志文件:${NC} ~/.claude/sync.log"
echo ""
echo -e "${YELLOW}管理命令:${NC}"
echo -e "  查看日志: ${GREEN}tail -f ~/.claude/sync.log${NC}"
echo -e "  手动同步: ${GREEN}$SYNC_SCRIPT${NC}"
echo -e "  查看任务: ${GREEN}crontab -l${NC}"
echo -e "  删除任务: ${GREEN}crontab -e${NC} (删除相关行)"
echo ""
