import {Request, Response} from "express";
import Database from "better-sqlite3";
import {getReleaseState} from "../database/utils";

export function releaseState(db: Database.Database, req: Request, res: Response) {
  try {
    const commitSha = req.query['commit-sha'] as string;

    if (!commitSha) {
      return res.status(400).json({error: 'Missing commit-sha parameter'});
    }

    const state = getReleaseState(db, commitSha);

    // Get additional details if available
    const stmt = db.prepare(`
            SELECT release_status, created_at, updated_at, started_at, ended_at
            FROM release_log
            WHERE git_commit_sha = ?
        `);
    const details = stmt.get(commitSha) as any;

    return res.status(200).json({
      commitSha,
      state,
      details: details || null
    });
  } catch (error) {
    console.error('Error handling releaseState request:', error);
    res.status(500).json({error: 'Internal Server Error'});
  }
}