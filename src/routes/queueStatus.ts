import { Request, Response } from "express";
import Database from "better-sqlite3";
import { isAnyReleaseRunning } from "../database/utils";

export function queueStatus(
  db: Database.Database,
  req: Request,
  res: Response
) {
  try {
    const stmt = db.prepare(`
      SELECT git_commit_sha, queued_at
      FROM release_log
      WHERE release_status = 'queued'
      ORDER BY queued_at ASC
    `);
    const queue = stmt.all() as Array<{
      git_commit_sha: string;
      queued_at: string;
    }>;

    const isRunning = isAnyReleaseRunning(db);

    return res.status(200).json({
      isRunning,
      queueLength: queue.length,
      queue: queue,
    });
  } catch (error) {
    console.error("Error getting queue status:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
