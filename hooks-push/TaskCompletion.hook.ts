#!/usr/bin/env bun
/**
 * TaskCompletion.hook.ts
 *
 * 在Agent完成任务时触发，上报结果和状态变更
 *
 * 触发时机：通过skill或手动调用
 *
 * 上报内容包括：
 * - 任务ID
 * - 完成状态（success/failed/partial）
 * - 结果内容
 * - 执行时长
 */

import { connect } from "net";
import { readFileSync } from "fs";

const DAEMON_SOCKET = process.env.DAEMON_SOCKET || "/tmp/claude-daemon.sock";
const SESSION_ID = process.env.SESSION_ID || "";

interface TaskReport {
  task_id: string;
  status: "success" | "failed" | "partial";
  result: string;
  error?: string;
  duration?: number;
}

interface CompletionRequest {
  action: "task_completion";
  session_id: string;
  report: TaskReport;
}

/**
 * 发送任务完成报告到Daemon
 */
async function reportCompletion(sessionId: string, report: TaskReport): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(DAEMON_SOCKET);

    const request: CompletionRequest = {
      action: "task_completion",
      session_id: sessionId,
      report,
    };

    socket.on("connect", () => {
      socket.write(JSON.stringify(request) + "\n");
    });

    let responseData = "";
    socket.on("data", (chunk) => {
      responseData += chunk.toString();
    });

    socket.on("end", () => {
      try {
        const response = JSON.parse(responseData.trim());
        resolve(response.success === true);
      } catch {
        resolve(false);
      }
    });

    socket.on("error", () => {
      resolve(false);
    });

    socket.setTimeout(5000);
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * 从文件读取任务报告（如果有）
 */
function readReportFromFile(filePath: string): TaskReport | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * 主处理逻辑
 */
async function main() {
  const args = process.argv.slice(2);

  // 解析命令行参数
  let taskId = args[0] || "default";
  let status: "success" | "failed" | "partial" = "success";
  let result = "";
  let error: string | undefined;
  let duration: number | undefined;

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--status" && args[i + 1]) {
      status = args[i + 1] as any;
      i++;
    } else if (arg === "--result" && args[i + 1]) {
      result = args[i + 1];
      i++;
    } else if (arg === "--error" && args[i + 1]) {
      error = args[i + 1];
      i++;
    } else if (arg === "--duration" && args[i + 1]) {
      duration = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === "--file" && args[i + 1]) {
      const report = readReportFromFile(args[i + 1]);
      if (report) {
        taskId = report.task_id;
        status = report.status;
        result = report.result;
        error = report.error;
        duration = report.duration;
      }
      i++;
    } else if (!result) {
      // 如果还没有结果，把当前参数当作结果
      result = arg;
    }
  }

  // 从stdin读取结果（如果没有通过参数提供）
  if (!result) {
    try {
      result = await Bun.stdin.text();
    } catch {
      result = "";
    }
  }

  const sessionId = SESSION_ID;
  if (!sessionId) {
    console.error("Error: SESSION_ID not set");
    process.exit(1);
  }

  const report: TaskReport = {
    task_id: taskId,
    status,
    result: result.trim(),
    error,
    duration,
  };

  try {
    const success = await reportCompletion(sessionId, report);

    if (success) {
      console.log(`✅ Task completion reported: ${taskId} (${status})`);
    } else {
      console.error(`❌ Failed to report task completion: ${taskId}`);
    }

    process.exit(success ? 0 : 1);
  } catch (err) {
    console.error("TaskCompletion hook error:", err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
