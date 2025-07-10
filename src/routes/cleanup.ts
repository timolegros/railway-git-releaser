import { DEFAULT_CLEANUP_DAYS } from "../config";
import { Request, Response } from "express";
import Database from "better-sqlite3";

export function cleanup(db: Database.Database, req: Request, res: Response) {
  try {
    const { days = DEFAULT_CLEANUP_DAYS } = req.body;

    const stmt = db.prepare(`
      DELETE
      FROM release_log
      WHERE queued_at < datetime('now', '-${days} days')
        AND release_status IN ('success', 'failed', 'timeout');
    `);
    const result = stmt.run();
    console.log(`Cleaned up ${result.changes} old release records`);

    return res.status(200).json({
      message: `Cleanup completed for releases older than ${days} days`,
    });
  } catch (error) {
    console.error("Error during manual cleanup:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
