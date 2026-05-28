export type LogLevel = "error" | "warn" | "info";
export type LogRuntime = "client" | "server" | "edge";

/** Shape inserted into the public.error_logs table. */
export type ErrorLogRow = {
  level: LogLevel;
  runtime: LogRuntime;
  user_id?: string | null;
  session_id?: string | null;
  request_id?: string | null;
  message: string;
  stack?: string | null;
  route?: string | null;
  user_agent?: string | null;
  env?: string | null;
  release?: string | null;
  context?: Record<string, unknown>;
};

/** Wire-format the client posts to /api/observability/log. */
export type ClientLogPayload = {
  level?: LogLevel;
  message: string;
  stack?: string;
  route?: string;
  session_id?: string;
  context?: Record<string, unknown>;
};
