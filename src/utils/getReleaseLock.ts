import Database from "better-sqlite3";
import {isAnyReleaseRunning, addToQueue, updateReleaseStatus, insertReleaseLog} from "../database/utils";
import {ReleaseState} from "../types";

export function getReleaseLock(db: Database.Database, commitSha: string, priority: number = 0): {
  success: boolean;
  queued: boolean
} {
  const transaction = db.transaction(() => {
    try {
      if (isAnyReleaseRunning(db)) {
        // Check if this commit is already in the queue
        const queueStmt = db.prepare('SELECT COUNT(*) as count FROM release_queue WHERE git_commit_sha = ?');
        const queueResult = queueStmt.get(commitSha) as { count: number };

        if (queueResult.count === 0) {
          addToQueue(db, commitSha, priority);
        }

        return {success: false, queued: true};
      }

      // Check if this commit has already been processed
      const existingStmt = db.prepare('SELECT release_status FROM release_log WHERE git_commit_sha = ?');
      const existing = existingStmt.get(commitSha) as { release_status: ReleaseState } | undefined;

      if (existing && existing.release_status === 'running') {
        return {success: false, queued: false}; // Already running this specific commit
      }

      const startTime = new Date();

      if (existing) {
        // Update existing record to running
        updateReleaseStatus(db, commitSha, 'running');
      } else {
        // Insert new record with running status
        insertReleaseLog(db, commitSha, 'running', startTime);
      }

      return {success: true, queued: false}; // Successfully acquired lock
    } catch (error) {
      console.error('Error in getReleaseLock transaction:', error);
      throw error;
    }
  });

  return transaction();
}