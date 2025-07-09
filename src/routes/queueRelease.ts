import {Request, Response} from "express";
import Database from "better-sqlite3";
import {getReleaseState} from "../database/utils";
import {getReleaseLock} from "../utils/getReleaseLock";
import {executeReleaseForCommit} from "../utils/executeRelease";

export function queueRelease(db: Database.Database, req: Request, res: Response) {
  try {
    const {commitSha: requestCommitSha, priority = 0} = req.body;

    if (!requestCommitSha) {
      return res.status(400).json({error: 'Missing commitSha in request body'});
    }

    // Validate commitSha format (basic validation)
    if (!/^[a-f0-9]{7,40}$/i.test(requestCommitSha)) {
      return res.status(400).json({error: 'Invalid commit SHA format'});
    }

    // Try to acquire global lock for this commit
    const lockResult = getReleaseLock(db, requestCommitSha, priority);

    if (!lockResult.success) {
      if (lockResult.queued) {
        const existingState = getReleaseState(db, requestCommitSha);
        return res.status(202).json({
          message: `Release for commit ${requestCommitSha} has been queued`,
          state: existingState === 'not_started' ? 'queued' : existingState,
          priority
        });
      } else {
        const existingState = getReleaseState(db, requestCommitSha);
        return res.status(409).json({
          error: `Release for commit ${requestCommitSha} is already running`,
          state: existingState
        });
      }
    }

    // Execute release for the requested commit
    executeReleaseForCommit(requestCommitSha, db);

    res.status(200).json({
      message: `Release triggered for commit ${requestCommitSha}`,
      state: 'running',
      priority
    });
  } catch (error) {
    console.error('Error triggering release:', error);
    res.status(500).json({error: 'Internal Server Error'});
  }
}