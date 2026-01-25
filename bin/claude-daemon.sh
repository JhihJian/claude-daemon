#!/usr/bin/env bash
#
# claude-daemon 守护进程管理工具
# 支持启动、停止、重启、查看状态、查看日志
#

set -e

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置
DAEMON_DIR="$HOME/.claude/daemon"
DAEMON_MAIN="$DAEMON_DIR/main.ts"
PID_FILE="$HOME/.claude/daemon.pid"
LOG_FILE="$HOME/.claude/daemon.log"
WEB_PORT="${WEB_PORT:-3000}"

# 检查 Bun 是否安装
check_bun() {
    if ! command -v bun &> /dev/null; then
        echo -e "${RED}错误: 未找到 Bun 运行时${NC}"
        echo "请先安装 Bun: https://bun.sh"
        exit 1
    fi
}

# 启动守护进程
start_daemon() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            echo -e "${YELLOW}守护进程已在运行 (PID: $pid)${NC}"
            return 1
        else
            rm -f "$PID_FILE"
        fi
    fi

    check_bun

    if [ ! -f "$DAEMON_MAIN" ]; then
        echo -e "${RED}错误: 找不到守护进程文件${NC}"
        echo "路径: $DAEMON_MAIN"
        echo "请重新运行安装: npx @jhihjian/claude-daemon install"
        exit 1
    fi

    echo -e "${GREEN}启动守护进程...${NC}"

    # 检查是否启用 Web UI
    local enable_web=""
    if [ "$1" = "--web-ui" ]; then
        enable_web="--enable-web-ui --web-port=$WEB_PORT"
        echo -e "${BLUE}启用 Web UI (端口: $WEB_PORT)${NC}"
    fi

    # 后台启动
    nohup bun "$DAEMON_MAIN" $enable_web >> "$LOG_FILE" 2>&1 &
    local pid=$!

    echo $pid > "$PID_FILE"

    # 等待启动
    sleep 2

    if ps -p "$pid" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ 守护进程已启动 (PID: $pid)${NC}"
        if [ "$1" = "--web-ui" ]; then
            echo -e "${BLUE}✓ Web UI: http://127.0.0.1:$WEB_PORT${NC}"
        fi
        echo "日志文件: $LOG_FILE"
    else
        rm -f "$PID_FILE"
        echo -e "${RED}✗ 启动失败${NC}"
        echo "查看日志: tail -f $LOG_FILE"
        exit 1
    fi
}

# 停止守护进程
stop_daemon() {
    if [ ! -f "$PID_FILE" ]; then
        echo -e "${YELLOW}守护进程未运行${NC}"
        return 0
    fi

    local pid=$(cat "$PID_FILE")

    if ! ps -p "$pid" > /dev/null 2>&1; then
        echo -e "${YELLOW}守护进程未运行 (PID 文件存在但进程不存在)${NC}"
        rm -f "$PID_FILE"
        return 0
    fi

    echo -e "${GREEN}停止守护进程...${NC}"
    kill -TERM "$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null

    # 等待进程停止
    local count=0
    while ps -p "$pid" > /dev/null 2>&1; do
        sleep 1
        count=$((count + 1))
        if [ $count -gt 10 ]; then
            echo -e "${RED}✗ 强制终止进程${NC}"
            kill -KILL "$pid" 2>/dev/null
            break
        fi
    done

    rm -f "$PID_FILE"
    echo -e "${GREEN}✓ 守护进程已停止${NC}"
}

# 重启守护进程
restart_daemon() {
    echo -e "${GREEN}重启守护进程...${NC}"
    stop_daemon
    sleep 1
    start_daemon "$@"
}

# 查看状态
status_daemon() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Claude Daemon 状态${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    if [ ! -f "$PID_FILE" ]; then
        echo -e "状态: ${RED}未运行${NC}"
        return 0
    fi

    local pid=$(cat "$PID_FILE")

    if ps -p "$pid" > /dev/null 2>&1; then
        echo -e "状态: ${GREEN}运行中${NC}"
        echo "PID: $pid"
        echo "日志: $LOG_FILE"

        # 检查 Web UI 是否启用
        if lsof -i:$WEB_PORT > /dev/null 2>&1; then
            echo -e "Web UI: ${GREEN}http://127.0.0.1:$WEB_PORT${NC}"
        fi

        # 显示进程信息
        echo ""
        echo "进程信息:"
        ps -p "$pid" -o pid,ppid,%cpu,%mem,etime,cmd | tail -n 1
    else
        echo -e "状态: ${RED}未运行${NC} (PID 文件存在但进程不存在)"
        rm -f "$PID_FILE"
    fi

    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# 查看日志
logs_daemon() {
    local lines="${1:-50}"

    if [ ! -f "$LOG_FILE" ]; then
        echo -e "${YELLOW}日志文件不存在${NC}"
        return 0
    fi

    if [ "$lines" = "-f" ] || [ "$lines" = "--follow" ]; then
        echo -e "${BLUE}实时查看日志 (Ctrl+C 退出):${NC}"
        tail -f "$LOG_FILE"
    else
        echo -e "${BLUE}最后 $lines 行日志:${NC}"
        tail -n "$lines" "$LOG_FILE"
    fi
}

# 显示帮助
show_help() {
    cat << EOF
Claude Daemon 守护进程管理工具

用法:
  claude-daemon start [--web-ui]  启动守护进程 (可选启用 Web UI)
  claude-daemon stop              停止守护进程
  claude-daemon restart           重启守护进程
  claude-daemon status            查看状态
  claude-daemon logs [N|-f]       查看日志 (N 行或 -f 实时)

示例:
  claude-daemon start             # 启动守护进程
  claude-daemon start --web-ui    # 启动守护进程并启用 Web UI
  claude-daemon logs 100          # 查看最后 100 行日志
  claude-daemon logs -f           # 实时查看日志

环境变量:
  WEB_PORT                        Web UI 端口 (默认: 3000)

EOF
}

# 主函数
main() {
    case "$1" in
        start)
            start_daemon "$2"
            ;;
        stop)
            stop_daemon
            ;;
        restart)
            restart_daemon "$2"
            ;;
        status)
            status_daemon
            ;;
        logs)
            logs_daemon "$2"
            ;;
        --help|-h|help|"")
            show_help
            ;;
        *)
            echo -e "${RED}未知命令: $1${NC}"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

main "$@"
