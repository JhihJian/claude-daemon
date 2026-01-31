#!/bin/bash
# test/test-e2e.sh
#
# End-to-End Test Script for Agent Collaboration Network
#
# This script automates testing of the multi-agent system

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DAEMON_SOCKET="/tmp/claude-daemon.sock"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_RESULTS_DIR="$PROJECT_DIR/test/results"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

test_start() {
    echo ""
    echo "========================================"
    echo "TEST: $1"
    echo "========================================"
}

test_pass() {
    echo -e "${GREEN}✓ PASS${NC}: $1"
    ((TESTS_PASSED++))
}

test_fail() {
    echo -e "${RED}✗ FAIL${NC}: $1"
    ((TESTS_FAILED++))
}

assert_equals() {
    if [ "$1" = "$2" ]; then
        return 0
    else
        test_fail "Expected '$2' but got '$1'"
        return 1
    fi
}

assert_contains() {
    if echo "$1" | grep -q "$2"; then
        return 0
    else
        test_fail "String '$2' not found in '$1'"
        return 1
    fi
}

# Create results directory
mkdir -p "$TEST_RESULTS_DIR"

# ============================================================
# Test Functions
# ============================================================

# Check if Daemon socket exists
check_daemon_socket() {
    test_start "Daemon Socket Check"

    if [ -S "$DAEMON_SOCKET" ]; then
        test_pass "Daemon socket exists at $DAEMON_SOCKET"
        return 0
    else
        test_fail "Daemon socket not found at $DAEMON_SOCKET"
        return 1
    fi
}

# Test Daemon API health endpoint
test_daemon_health() {
    test_start "Daemon Health Check"

    # Start web server if not running
    if ! curl -s http://127.0.0.1:3000/api/health > /dev/null 2>&1; then
        log_warn "Web server not running, starting..."
        cd "$PROJECT_DIR"
        bun run web/server.ts &
        WEB_PID=$!
        sleep 2
    fi

    RESPONSE=$(curl -s http://127.0.0.1:3000/api/health)

    if echo "$RESPONSE" | grep -q '"status":"ok"'; then
        test_pass "Daemon health check passed"
        echo "  Response: $RESPONSE"
        return 0
    else
        test_fail "Daemon health check failed"
        return 1
    fi
}

# Test Agent Registry API
test_agent_registry() {
    test_start "Agent Registry API"

    RESPONSE=$(curl -s http://127.0.0.1:3000/api/agents)

    if echo "$RESPONSE" | grep -q '\['; then
        test_pass "Agent registry API returns valid JSON"
        AGENT_COUNT=$(echo "$RESPONSE" | grep -o '"sessionId"' | wc -l)
        echo "  Registered agents: $AGENT_COUNT"
        return 0
    else
        test_fail "Agent registry API failed"
        return 1
    fi
}

# Test Agent Stats API
test_agent_stats() {
    test_start "Agent Statistics"

    RESPONSE=$(curl -s http://127.0.0.1:3000/api/agents/stats)

    if echo "$RESPONSE" | grep -q '"total"'; then
        test_pass "Agent stats API returns data"
        echo "  Stats: $RESPONSE"
        return 0
    else
        test_fail "Agent stats API failed"
        return 1
    fi
}

# Test Config Packages API
test_config_packages() {
    test_start "Config Packages API"

    RESPONSE=$(curl -s http://127.0.0.1:3000/api/configs)

    if echo "$RESPONSE" | grep -q 'master-agent\|analyzer-agent'; then
        test_pass "Config packages API returns packages"
        echo "  Available configs: $(echo "$RESPONSE" | grep -o '"name":"[^"]*"' | cut -d'"' -f4 | tr '\n' ', ')"
        return 0
    else
        test_fail "Config packages API failed"
        return 1
    fi
}

# Test Message API via Unix Socket
test_message_api() {
    test_start "Message API (Unix Socket)"

    if [ ! -S "$DAEMON_SOCKET" ]; then
        test_fail "Daemon socket not available"
        return 1
    fi

    # Send a test message
    RESPONSE=$(echo '{"action":"query_messages"}' | nc -U "$DAEMON_SOCKET" 2>/dev/null)

    if echo "$RESPONSE" | grep -q '"success":true\|"messages":'; then
        test_pass "Message API responds correctly"
        return 0
    else
        test_fail "Message API failed"
        return 1
    fi
}

# Test Agent Registration via Socket
test_agent_registration() {
    test_start "Agent Registration (Socket API)"

    if [ ! -S "$DAEMON_SOCKET" ]; then
        test_fail "Daemon socket not available"
        return 1
    fi

    # Test register_agent action
    TEST_SESSION_ID="test-$(date +%s)"
    RESPONSE=$(echo "{\"action\":\"register_agent\",\"session_id\":\"$TEST_SESSION_ID\",\"type\":\"worker\",\"label\":\"Test-Worker\"}" | nc -U "$DAEMON_SOCKET" 2>/dev/null)

    if echo "$RESPONSE" | grep -q '"success":true'; then
        test_pass "Agent registration successful"

        # Clean up - unregister
        echo "{\"action\":\"unregister_agent\",\"session_id\":\"$TEST_SESSION_ID\"}" | nc -U "$DAEMON_SOCKET" > /dev/null 2>&1
        return 0
    else
        test_fail "Agent registration failed"
        return 1
    fi
}

# Test Get Agent API
test_get_agent() {
    test_start "Get Agent Details"

    RESPONSE=$(curl -s http://127.0.0.1:3000/api/agents)

    if echo "$RESPONSE" | grep -q '\[\]'; then
        log_warn "No agents registered, skipping get agent test"
        return 0
    fi

    # Extract first agent ID
    AGENT_ID=$(echo "$RESPONSE" | grep -o '"sessionId":"[^"]*"' | head -1 | cut -d'"' -f4)

    if [ -z "$AGENT_ID" ]; then
        test_fail "Could not extract agent ID"
        return 1
    fi

    # Get agent details
    AGENT_RESPONSE=$(curl -s "http://127.0.0.1:3000/api/agents/$AGENT_ID")

    if echo "$AGENT_RESPONSE" | grep -q "$AGENT_ID"; then
        test_pass "Get agent details successful"
        return 0
    else
        test_fail "Get agent details failed"
        return 1
    fi
}

# Test Worker Agents Query
test_get_workers() {
    test_start "Get Available Workers"

    RESPONSE=$(curl -s http://127.0.0.1:3000/api/agents/workers)

    # Returns array (possibly empty)
    if echo "$RESPONSE" | grep -q '\['; then
        WORKER_COUNT=$(echo "$RESPONSE" | grep -o '"sessionId"' | wc -l)
        test_pass "Get workers API successful ($WORKER_COUNT workers available)"
        return 0
    else
        test_fail "Get workers API failed"
        return 1
    fi
}

# ============================================================
# Manual Test Instructions
# ============================================================

print_manual_tests() {
    cat << 'EOF'

========================================
MANUAL TESTS REQUIRE INTERACTIVE SESSION
========================================

The following tests require manual agent sessions:

1. PARALLEL INDEPENDENT MODE
   - Start Master Agent (see docs/E2E-TEST-PLAN.md)
   - Start 3 Worker Agents
   - In Master, request: "Analyze the daemon architecture"
   - Verify all workers receive the same task
   - Verify results are aggregated

2. DISTRIBUTED TASK MODE
   - With agents running, request: "Comprehensive code review"
   - Verify task is decomposed
   - Verify workers get different subtasks
   - Verify results are combined

3. AGENT HEARTBEAT
   - Note active agents
   - Kill a worker (Ctrl+C)
   - Wait 6 minutes
   - Verify agent shows as "disconnected"

4. MESSAGE INJECTION
   - Start an agent
   - Send message via: nc -U /tmp/claude-daemon.sock
   - Verify agent sees message in context

5. TASK COMPLETION
   - Agent completes task
   - Verify TaskCompletion hook reports result
   - Verify result appears in ~/.claude/AGENT_TASKS/

For detailed steps, see: docs/E2E-TEST-PLAN.md

EOF
}

# ============================================================
# Cleanup
# ============================================================

cleanup() {
    log_info "Cleaning up test environment..."

    # Kill web server if we started it
    if [ -n "$WEB_PID" ]; then
        kill $WEB_PID 2>/dev/null || true
    fi

    # Clean up test results older than 7 days
    find "$TEST_RESULTS_DIR" -name "*.log" -mtime +7 -delete 2>/dev/null || true

    log_info "Cleanup complete"
}

# ============================================================
# Main Test Runner
# ============================================================

main() {
    echo "========================================="
    echo "  Agent Collaboration E2E Test Suite"
    echo "========================================="
    echo ""
    echo "Project: $PROJECT_DIR"
    echo "Socket:  $DAEMON_SOCKET"
    echo ""

    # Trap cleanup on exit
    trap cleanup EXIT

    # Run automated tests
    check_daemon_socket || true
    test_daemon_health || true
    test_agent_registry || true
    test_agent_stats || true
    test_config_packages || true
    test_message_api || true
    test_agent_registration || true
    test_get_agent || true
    test_get_workers || true

    # Print summary
    echo ""
    echo "========================================="
    echo "  TEST SUMMARY"
    echo "========================================="
    echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
    echo "Total:  $((TESTS_PASSED + TESTS_FAILED))"
    echo ""

    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}All automated tests passed!${NC}"
    else
        echo -e "${RED}Some tests failed. Check output above.${NC}"
    fi

    # Print manual test instructions
    print_manual_tests

    # Return exit code
    if [ $TESTS_FAILED -gt 0 ]; then
        exit 1
    else
        exit 0
    fi
}

# Run tests
main "$@"
