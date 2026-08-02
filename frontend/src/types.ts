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

export interface Dashboard {
  ok: boolean;
  auth: {
    authorized: boolean;
    expiresAt?: number;
    hasRefreshToken: boolean;
    name?: string;
    email?: string;
  };
  logs: LogEntry[];
  posts: LogEntry[];
  errorCount: number;
  recentErrors: LogEntry[];
  health: {
    redis: boolean;
    linkedin: boolean;
  };
}