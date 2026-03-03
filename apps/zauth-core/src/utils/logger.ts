import { config } from "../config.js";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || (config.isProd ? "info" : "debug");

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatEntry(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: "zauth-core",
    ...meta,
  };
  return JSON.stringify(entry);
}

export const logger = {
  debug(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog("debug")) console.log(formatEntry("debug", message, meta));
  },
  info(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog("info")) console.log(formatEntry("info", message, meta));
  },
  warn(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog("warn")) console.warn(formatEntry("warn", message, meta));
  },
  error(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog("error")) console.error(formatEntry("error", message, meta));
  },
};
