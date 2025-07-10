import {getReleaseState, removeFromQueue} from "../database/utils";
import {Request, Response} from "express";
import Database from "better-sqlite3";
import { validateCommitSha } from "../utils/validation";

export function cancelRelease(db: Database.Database, req: Request, res: Response) {
  try {
    const {commitSha} = req.params;

    try {
      validateCommitSha(commitSha);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return res.status(400).json({ error: errorMessage });
    }

    const transaction = db.transaction(() => {
      const state = getReleaseState(db, commitSha);
      if (state === 'queued') {
        removeFromQueue(db, commitSha);
      }
      return state;
    });
    const state = transaction();

    if (state === undefined) {
      return res.status(404).json({
        error: `Release for commit ${commitSha} not found`
      });
    }

    if (['running', 'failed', 'success', 'timeout'].includes(state)) {
      return res.status(409).json({
        error: 'Can only cancel queued releases',
        state
      });
    }

    return res.status(200).json({
      message: `Release for commit ${commitSha} removed from queue`
    });
  } catch (error) {
    console.error('Error cancelling queued release:', error);
    res.status(500).json({error: 'Internal Server Error'});
  }
}