/**
 * Simple logger for server-side logging
 */

type LogLevel = "debug" | "info" | "warn" | "error";

function createLogger(namespace: string) {
  const log = (level: LogLevel, message: string, data?: Record<string, unknown>) => {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}] [${namespace}]`;

    if (data) {
      console[level](`${prefix} ${message}`, data);
    } else {
      console[level](`${prefix} ${message}`);
    }
  };

  return {
    debug: (message: string, data?: Record<string, unknown>) => log("debug", message, data),
    info: (message: string, data?: Record<string, unknown>) => log("info", message, data),
    warn: (message: string, data?: Record<string, unknown>) => log("warn", message, data),
    error: (message: string, data?: Record<string, unknown>) => log("error", message, data),
  };
}

export const logger = {
  api: createLogger("api"),
  git: createLogger("git"),
  chat: createLogger("chat"),
  specSearch: createLogger("spec-search"),
};
