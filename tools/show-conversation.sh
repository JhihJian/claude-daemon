#!/bin/bash
# 显示会话对话内容的友好脚本

SESSION_ID=$1

if [ -z "$SESSION_ID" ]; then
  echo "用法: $0 <session_id>"
  echo ""
  echo "示例:"
  echo "  $0 04291516-d83b-4436-86c2-138eb01a1bf4"
  echo ""
  echo "或者查看最近的会话:"
  echo "  ~/.bun/bin/bun /data/app/claude-history/tools/SessionQuery.ts recent 1 | jq -r '.[0].session_id' | xargs $0"
  exit 1
fi

# 查找summary文件
SUMMARY_FILE=$(find ~/.claude/SESSIONS/analysis/summaries -name "summary-${SESSION_ID}.json" 2>/dev/null | head -1)

if [ -z "$SUMMARY_FILE" ]; then
  echo "错误: 找不到会话 $SESSION_ID"
  exit 1
fi

# 提取并显示信息
echo "========================================"
echo "会话详情"
echo "========================================"
echo ""

# 基本信息
echo "📋 会话ID: $SESSION_ID"
echo "🖥️  主机: $(jq -r '.hostname' "$SUMMARY_FILE") ($(jq -r '.user' "$SUMMARY_FILE")@$(jq -r '.platform' "$SUMMARY_FILE"))"
echo "📁 工作目录: $(jq -r '.working_directory' "$SUMMARY_FILE")"
echo "📅 时间: $(jq -r '.timestamp' "$SUMMARY_FILE")"
echo "🏷️  类型: $(jq -r '.session_type' "$SUMMARY_FILE")"
echo ""

# 对话内容
echo "========================================"
echo "💬 对话内容"
echo "========================================"
echo ""

# 提取用户消息和助手回复
USER_MSGS=$(jq -r '.conversation.user_messages[]?' "$SUMMARY_FILE" 2>/dev/null)
ASST_MSGS=$(jq -r '.conversation.assistant_responses[]?' "$SUMMARY_FILE" 2>/dev/null)

if [ -z "$USER_MSGS" ]; then
  echo "⚠️  没有记录对话内容"
else
  # 交替显示用户和助手消息
  jq -r '.conversation |
    .user_messages as $users |
    .assistant_responses as $assts |
    range(0; [$users, $assts] | map(length) | max) |
    (
      if $users[.] then "👤 用户: \($users[.])\n" else "" end,
      if $assts[.] then "🤖 Claude: \($assts[.])\n" else "" end
    )' "$SUMMARY_FILE"
fi

echo ""
echo "========================================"
echo "🔧 工具使用"
echo "========================================"
echo ""

TOOL_COUNT=$(jq -r '.total_tools' "$SUMMARY_FILE")
if [ "$TOOL_COUNT" -eq 0 ]; then
  echo "没有使用工具"
else
  echo "总计: $TOOL_COUNT 次工具调用"
  echo ""
  jq -r '.tool_usage | to_entries[] | "  - \(.key): \(.value) 次"' "$SUMMARY_FILE"
  echo ""
  echo "成功率: $(jq -r '.success_rate' "$SUMMARY_FILE")%"
fi

echo ""
