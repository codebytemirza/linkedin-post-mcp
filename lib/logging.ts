import { redis } from "./config";

export const LOGS_KEY = "linkedin:logs";

export type LogType = "post" | "auth" | "tool" | "error";
export type LogLevel = "info" | "success" | "error";

export interface LogEntry {
  ts: number;
  type: LogType;
  level: LogLevel;
  action: string;
  detail?: string;
  postId?: string;
}

const MAX_LOGS = 500;

/**
 * Appends a log entry to the Upstash Redis list (LPUSH), capping to MAX_LOGS.
 * Non-fatal: errors here must never break the app flow, so we swallow them.
 */
export async function logEvent(
  type: LogType,
  level: LogLevel,
  action: string,
  extra: Omit<LogEntry, "type" | "level" | "action" | "ts"> = {}
): Promise<void> {
  const entry: LogEntry = { type, level, action, ts: Date.now(), ...extra };
  try {
    await redis.lpush(LOGS_KEY, entry);
    await redis.ltrim(LOGS_KEY, 0, MAX_LOGS - 1);
  } catch {
    // Best-effort telemetry; never break the caller on log failure.
  }
}

/** Reads the most recent log entries, newest first. */
export async function readLogs(limit = 100): Promise<LogEntry[]> {
  try {
    return await redis.lrange(LOGS_KEY, 0, limit - 1);
  } catch {
    return [];
  }
}