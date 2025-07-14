import dotenv from "dotenv";

if (process.env.NODE_ENV !== "production") {
  dotenv.config();
}

export const NODE_ENV = process.env.NODE_ENV || "development";

export const PORT = parseInt("8000");

export const SQLITE_DB_PATH = (() => {
  if (NODE_ENV === "test") return ":memory:";
  else if (process.env.SQLITE_DB_PATH) return process.env.SQLITE_DB_PATH;
  // defaults to mounted volume in production
  else if (NODE_ENV === 'production') return "/data/database.sqlite";
  else return "database.sqlite";
})();

export const DEFAULT_CLEANUP_DAYS = process.env.DEFAULT_CLEANUP_DAYS
  ? parseInt(process.env.DEFAULT_CLEANUP_DAYS)
  : 30;

export const RELEASE_TIMEOUT_MS = process.env.RELEASE_TIMEOUT_MS
  ? parseInt(process.env.RELEASE_TIMEOUT_MS)
  : 30 * 60 * 1000; // 30 minutes

export const QUEUE_INTERVAL_MS = process.env.QUEUE_INTERVAL_MS
  ? parseInt(process.env.QUEUE_INTERVAL_MS)
  : 5 * 1000; // 5 seconds

export const GRACEFUL_SHUTDOWN_MS =
  NODE_ENV === "test"
    ? 1000
    : process.env.GRACEFUL_SHUTDOWN_MS
    ? parseInt(process.env.GRACEFUL_SHUTDOWN_MS)
    : 5 * 1000; // 5 seconds
