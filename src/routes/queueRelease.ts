import { Request, Response } from "express";
import Database from "better-sqlite3";
import {
  addToQueue,
  searchReleaseLog,
} from "../database/utils";
import { validateCommitSha } from "../utils/validation";

export function queueRelease(
  db: Database.Database,
  req: Request,
  res: Response
) {
  try {
    const { commitSha } = req.body;

    try {
      validateCommitSha(commitSha);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return res.status(400).json({ error: errorMessage });
    }

    const releaseLog = searchReleaseLog(db, commitSha);

    // TODO: allow retrying failed releases
    if (releaseLog) {
      return res.status(202).json({
        message: `Release for commit ${commitSha} exists with status ${releaseLog.release_status}`,
        state: releaseLog.release_status,
      });
    }

    addToQueue(db, commitSha);

    res.status(200).json({
      message: `Release queued for commit ${commitSha}`,
      state: "queued",
    });
  } catch (error) {
    console.error("Error triggering release:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
