import {getReleaseState, removeFromQueue} from "../database/utils";
import {Request, Response} from "express";
import Database from "better-sqlite3";

export function cancelRelease(db: Database.Database, req: Request, res: Response) {
  try {
    const {commitSha} = req.params;

    if (!commitSha) {
      return res.status(400).json({error: 'Missing commit SHA'});
    }

    // Check if it's currently running
    const state = getReleaseState(db, commitSha);
    if (state === 'running') {
      return res.status(409).json({
        error: 'Cannot cancel a running release',
        state
      });
    }

    // Remove from queue
    removeFromQueue(db, commitSha);

    return res.status(200).json({
      message: `Release for commit ${commitSha} removed from queue`
    });
  } catch (error) {
    console.error('Error cancelling queued release:', error);
    res.status(500).json({error: 'Internal Server Error'});
  }
}