import { Request, Response } from "express";
import Database from "better-sqlite3";

export function metrics(db: Database.Database, req: Request, res: Response) {
  try {
    const days = req.query.days;
    if (!days || isNaN(parseInt(days as string))) {
      return res.status(400).json({ error: "days parameter is required" });
    }

    const stmt = db.prepare(`
      SELECT release_status,
             COUNT(*) as count,
             AVG(
                     CASE
                         WHEN started_at IS NOT NULL AND ended_at IS NOT NULL
                             THEN (julianday(ended_at) - julianday(started_at)) * 24 * 60
                         ELSE NULL
                         END
             )        as avg_duration_minutes
      FROM release_log
      WHERE queued_at >= datetime('now', '-${days} days')
      GROUP BY release_status
  `);

    const metrics = stmt.all();

    return res.status(200).json({
      period: `${days} days`,
      metrics,
    });
  } catch (error) {
    console.error("Error getting release metrics:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
