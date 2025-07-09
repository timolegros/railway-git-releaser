export const SQLITE_DB_PATH = process.env.SQLITE_DB_PATH || 'database.sqlite';

export const DEFAULT_CLEANUP_DAYS = process.env.DEFAULT_CLEANUP_DAYS ? parseInt(process.env.DEFAULT_CLEANUP_DAYS) : 30;

export const RELEASE_TIMEOUT_MS = process.env.RELEASE_TIMEOUT_MS ? parseInt(process.env.RELEASE_TIMEOUT_MS) : 30 * 60 * 1000; // 30 minutes