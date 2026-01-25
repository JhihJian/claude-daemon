#!/bin/bash
# 守护进程功能测试脚本

set -e

COLORS_RED='\033[0;31m'
COLORS_GREEN='\033[0;32m'
COLORS_YELLOW='\033[1;33m'
COLORS_BLUE='\033[0;34m'
COLORS_NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0

echo -e "${COLORS_BLUE}╔════════════════════════════════════════╗${COLORS_NC}"
echo -e "${COLORS_BLUE}║  Claude Daemon - 功能测试              ║${COLORS_NC}"
echo -e "${COLORS_BLUE}╚════════════════════════════════════════╝${COLORS_NC}"
echo ""

# 测试函数
test_pass() {
    echo -e "${COLORS_GREEN}✓ $1${COLORS_NC}"
    ((TESTS_PASSED++))
}

test_fail() {
    echo -e "${COLORS_RED}✗ $1${COLORS_NC}"
    if [ -n "$2" ]; then
        echo -e "${COLORS_RED}  错误: $2${COLORS_NC}"
    fi
    ((TESTS_FAILED++))
}

test_section() {
    echo ""
    echo -e "${COLORS_YELLOW}[$1]${COLORS_NC}"
}

# 1. 检查文件结构
test_section "1. 文件结构检查"

if [ -f "daemon/main.ts" ]; then
    test_pass "daemon/main.ts 存在"
else
    test_fail "daemon/main.ts 缺失"
fi

if [ -f "daemon/hook-server.ts" ]; then
    test_pass "daemon/hook-server.ts 存在"
else
    test_fail "daemon/hook-server.ts 缺失"
fi

if [ -f "daemon/event-queue.ts" ]; then
    test_pass "daemon/event-queue.ts 存在"
else
    test_fail "daemon/event-queue.ts 缺失"
fi

if [ -f "daemon/storage-service.ts" ]; then
    test_pass "daemon/storage-service.ts 存在"
else
    test_fail "daemon/storage-service.ts 缺失"
fi

if [ -f "daemon/session-analyzer.ts" ]; then
    test_pass "daemon/session-analyzer.ts 存在"
else
    test_fail "daemon/session-analyzer.ts 缺失"
fi

if [ -f "daemon/scheduler.ts" ]; then
    test_pass "daemon/scheduler.ts 存在"
else
    test_fail "daemon/scheduler.ts 缺失"
fi

if [ -f "daemon/health-monitor.ts" ]; then
    test_pass "daemon/health-monitor.ts 存在"
else
    test_fail "daemon/health-monitor.ts 缺失"
fi

if [ -f "daemon/cleanup-service.ts" ]; then
    test_pass "daemon/cleanup-service.ts 存在"
else
    test_fail "daemon/cleanup-service.ts 缺失"
fi

# 2. 检查 Hooks
test_section "2. Hooks 检查"

if [ -f "hooks-push/SessionRecorder.hook.ts" ]; then
    test_pass "SessionRecorder.hook.ts 存在"
else
    test_fail "SessionRecorder.hook.ts 缺失"
fi

if [ -f "hooks-push/SessionToolCapture.hook.ts" ]; then
    test_pass "SessionToolCapture.hook.ts 存在"
else
    test_fail "SessionToolCapture.hook.ts 缺失"
fi

if [ -f "hooks-push/SessionAnalyzer.hook.ts" ]; then
    test_pass "SessionAnalyzer.hook.ts 存在"
else
    test_fail "SessionAnalyzer.hook.ts 缺失"
fi

# 3. 检查管理工具
test_section "3. 管理工具检查"

if [ -f "bin/claude-daemon" ]; then
    test_pass "claude-daemon CLI 存在"
    if [ -x "bin/claude-daemon" ]; then
        test_pass "claude-daemon 可执行"
    else
        test_fail "claude-daemon 不可执行"
    fi
else
    test_fail "claude-daemon CLI 缺失"
fi

# 4. 检查系统服务配置
test_section "4. 系统服务配置检查"

if [ -f "systemd/claude-daemon@.service" ]; then
    test_pass "systemd 配置存在"
else
    test_fail "systemd 配置缺失"
fi

if [ -f "launchd/com.claudecode.daemon.plist" ]; then
    test_pass "launchd 配置存在"
else
    test_fail "launchd 配置缺失"
fi

# 5. 检查文档
test_section "5. 文档检查"

if [ -f "DAEMON-GUIDE.md" ]; then
    test_pass "使用指南存在"
else
    test_fail "使用指南缺失"
fi

if [ -f "DAEMON-IMPLEMENTATION.md" ]; then
    test_pass "实现报告存在"
else
    test_fail "实现报告缺失"
fi

if [ -f "install-daemon.sh" ]; then
    test_pass "安装脚本存在"
    if [ -x "install-daemon.sh" ]; then
        test_pass "安装脚本可执行"
    else
        test_fail "安装脚本不可执行"
    fi
else
    test_fail "安装脚本缺失"
fi

# 6. 代码完整性检查
test_section "6. 代码完整性检查"

# 检查 main.ts 是否包含必要的类和方法
if grep -q "class ClaudeDaemon" daemon/main.ts; then
    test_pass "main.ts 包含 ClaudeDaemon 类"
else
    test_fail "main.ts 缺少 ClaudeDaemon 类"
fi

if grep -q "async start()" daemon/main.ts; then
    test_pass "main.ts 包含 start 方法"
else
    test_fail "main.ts 缺少 start 方法"
fi

if grep -q "setupHookHandlers" daemon/main.ts; then
    test_pass "main.ts 包含 setupHookHandlers"
else
    test_fail "main.ts 缺少 setupHookHandlers"
fi

if grep -q "setupScheduledTasks" daemon/main.ts; then
    test_pass "main.ts 包含 setupScheduledTasks"
else
    test_fail "main.ts 缺少 setupScheduledTasks"
fi

# 检查 hook-server.ts
if grep -q "class HookServer" daemon/hook-server.ts; then
    test_pass "hook-server.ts 包含 HookServer 类"
else
    test_fail "hook-server.ts 缺少 HookServer 类"
fi

if grep -q "createServer" daemon/hook-server.ts; then
    test_pass "hook-server.ts 使用 Unix Socket"
else
    test_fail "hook-server.ts 未使用 Unix Socket"
fi

# 检查 Hooks 是否包含推送逻辑
if grep -q "pushToDaemon" hooks-push/SessionRecorder.hook.ts; then
    test_pass "SessionRecorder 包含推送逻辑"
else
    test_fail "SessionRecorder 缺少推送逻辑"
fi

if grep -q "fallbackToFileMode" hooks-push/SessionRecorder.hook.ts; then
    test_pass "SessionRecorder 包含回退逻辑"
else
    test_fail "SessionRecorder 缺少回退逻辑"
fi

# 7. 导入路径检查
test_section "7. 导入路径检查"

# 检查相对导入是否正确
if grep -q "from '../lib/" daemon/main.ts; then
    test_pass "main.ts 导入路径正确"
else
    test_fail "main.ts 导入路径错误"
fi

if grep -q "from './hook-server.ts'" daemon/main.ts; then
    test_pass "main.ts 内部导入正确"
else
    test_fail "main.ts 内部导入错误"
fi

# 8. 配置文件检查
test_section "8. 配置文件检查"

if grep -q "SESSION_LOG_LEVEL" lib/logger.ts; then
    test_pass "日志系统支持环境变量"
else
    test_fail "日志系统不支持环境变量"
fi

if grep -q "PAI_DIR" lib/config.ts; then
    test_pass "配置系统支持 PAI_DIR"
else
    test_fail "配置系统不支持 PAI_DIR"
fi

# 总结
echo ""
echo -e "${COLORS_BLUE}╔════════════════════════════════════════╗${COLORS_NC}"
echo -e "${COLORS_BLUE}║           测试结果                      ║${COLORS_NC}"
echo -e "${COLORS_BLUE}╚════════════════════════════════════════╝${COLORS_NC}"
echo ""
echo -e "通过: ${COLORS_GREEN}$TESTS_PASSED${COLORS_NC}"
echo -e "失败: ${COLORS_RED}$TESTS_FAILED${COLORS_NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${COLORS_GREEN}✓ 所有测试通过！${COLORS_NC}"
    echo ""
    echo -e "${COLORS_YELLOW}下一步:${COLORS_NC}"
    echo "  1. 运行 ./install-daemon.sh 安装"
    echo "  2. 使用 claude-daemon start 启动守护进程"
    echo "  3. 测试 Claude Code 集成"
    exit 0
else
    echo -e "${COLORS_RED}✗ 有 $TESTS_FAILED 个测试失败${COLORS_NC}"
    exit 1
fi
