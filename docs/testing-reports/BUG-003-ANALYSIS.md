# BUG-003: Hook Startup Error - Root Cause Analysis

**Date**: 2026-01-31
**Status**: ✅ ROOT CAUSE IDENTIFIED

---

## Problem

User reports: "SessionStart:startup hook error" when launching Claude Code CLI

---

## Root Cause

The hook crashes when stdin is empty or contains invalid JSON.

**Evidence**:
```bash
# Works with valid JSON:
$ echo '{"session_id":"test-123","claude_version":"2.0"}' | bun SessionRecorder.hook.ts
{"continue":true}  ✅

# Fails with empty stdin:
$ echo "" | bun SessionRecorder.hook.ts
SyntaxError: JSON Parse error: Unexpected EOF
      at SessionRecorder.hook.ts:18:20  ❌
```

**Vulnerable Code** (lines 17-18):
```typescript
const input = await Bun.stdin.text();
const event = JSON.parse(input);  // ❌ No error handling
```

---

## Why This Happens

1. Claude Code may invoke hooks before stdin is fully ready
2. Race condition in hook execution timing
3. No defensive error handling in hook code
4. Hook crashes instead of gracefully handling bad input

---

## Impact

- Hook fails on startup
- User sees error message
- Session recording may be incomplete
- Poor user experience

---

## Solution

Add error handling for empty/invalid stdin:

```typescript
// Read Hook input with error handling
let input: string;
let event: any;

try {
  input = await Bun.stdin.text();

  if (!input || input.trim() === '') {
    console.error('[SessionRecorder] Warning: Empty stdin received');
    console.log(JSON.stringify({ continue: true }));
    process.exit(0);
  }

  event = JSON.parse(input);
} catch (error) {
  console.error('[SessionRecorder] Error parsing input:', error);
  console.log(JSON.stringify({ continue: true }));
  process.exit(0);
}
```

---

## Fix Priority

**P1 - High**: Affects user experience, easy to fix

---

## Testing Plan

1. Test with valid JSON ✅
2. Test with empty stdin ✅
3. Test with invalid JSON
4. Test with malformed JSON
5. Test in actual Claude Code environment

---

## Related Issues

This same pattern exists in all hooks:
- SessionRecorder.hook.ts ❌
- SessionToolCapture.hook.ts ❌
- SessionAnalyzer.hook.ts ❌
- AgentStatus.hook.ts ❌
- AgentMessaging.hook.ts ❌
- TaskCompletion.hook.ts ❌

**All hooks need this fix.**
