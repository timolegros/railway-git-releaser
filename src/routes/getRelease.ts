import {Request, Response} from "express";
import Database from "better-sqlite3";
import { validateCommitSha } from "../utils/validation";
import { ReleaseLogItem } from "../types";

export function getRelease(db: Database.Database, req: Request, res: Response) {
  try {
    const {commitSha} = req.params;
    console.log('>>>>>>>>>>>>>>>> commitSha', commitSha);
    try {
      validateCommitSha(commitSha);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return res.status(400).json({ error: errorMessage });
    }

    const stmt = db.prepare(`
            SELECT *
            FROM release_log
            WHERE git_commit_sha = ?;
        `);
    const details = stmt.get(commitSha) as ReleaseLogItem | undefined;

    return res.status(200).json(details ?? {});
  } catch (error) {
    console.error('Error handling releaseState request:', error);
    res.status(500).json({error: 'Internal Server Error'});
  }
}