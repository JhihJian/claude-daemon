#!/bin/bash
# test/test-messaging.sh

SOCKET="/tmp/claude-daemon.sock"

echo "=== Message System Test ==="
echo

# 假设有两个已注册的agent: agent-001, agent-002

# 测试1: 发送消息
echo "Test 1: Send message from agent-001 to agent-002"
echo '{"action":"send_message","from":"agent-001","to":"agent-002","type":"task","content":"Analyze this repository"}' | nc -U $SOCKET
echo
echo

# 测试2: 查询agent-002的消息
echo "Test 2: Get messages for agent-002"
echo '{"action":"get_messages","session_id":"agent-002"}' | nc -U $SOCKET
echo
echo

# 测试3: 查询未读消息
echo "Test 3: Get unread messages for agent-002"
echo '{"action":"get_messages","session_id":"agent-002","unread_only":true}' | nc -U $SOCKET
echo
echo

# 测试4: 标记消息为已读
echo "Test 4: Mark messages as read"
echo '{"action":"mark_messages_read","session_id":"agent-002","message_ids":["msg_xxx"]}' | nc -U $SOCKET
echo
echo

# 测试5: 查询所有消息
echo "Test 5: Query all messages"
echo '{"action":"query_messages"}' | nc -U $SOCKET
echo
echo

# 测试6: 报告任务完成
echo "Test 6: Report task completion"
echo '{"action":"task_completion","session_id":"agent-002","report":{"task_id":"task-001","status":"success","result":"Analysis complete","duration":5000}}' | nc -U $SOCKET
echo
echo

echo "=== Test Complete ==="
