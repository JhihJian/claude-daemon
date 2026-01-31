#!/bin/bash
# test/test-agent-registry.sh
# 手动测试Agent Registry功能的脚本

SOCKET="/tmp/claude-daemon.sock"

echo "=== Agent Registry Manual Test ==="
echo

# 测试1: 注册master agent
echo "Test 1: Register master agent"
echo '{"action":"register_agent","session_id":"master-001","type":"master","label":"Master Agent","config":"master-config","working_dir":"/home/user/project"}' | nc -U $SOCKET
echo
echo

# 测试2: 注册worker agent
echo "Test 2: Register worker agent"
echo '{"action":"register_agent","session_id":"worker-001","type":"worker","label":"Worker Agent 1","config":"analyzer","working_dir":"/tmp/worker1","parent_id":"master-001"}' | nc -U $SOCKET
echo
echo

# 测试3: 查询所有agent
echo "Test 3: List all agents"
echo '{"action":"get_all_agents"}' | nc -U $SOCKET
echo
echo

# 测试4: 查询worker类型的agent
echo "Test 4: List worker agents"
echo '{"action":"list_agents","type":"worker"}' | nc -U $SOCKET
echo
echo

# 测试5: 更新agent状态
echo "Test 5: Update agent status to busy"
echo '{"action":"update_agent_status","session_id":"worker-001","status":"busy"}' | nc -U $SOCKET
echo
echo

# 测试6: 心跳
echo "Test 6: Send heartbeat"
echo '{"action":"agent_heartbeat","session_id":"worker-001"}' | nc -U $SOCKET
echo
echo

# 测试7: 注销agent
echo "Test 7: Unregister agent"
echo '{"action":"unregister_agent","session_id":"worker-001"}' | nc -U $SOCKET
echo
echo

echo "=== Test Complete ==="
