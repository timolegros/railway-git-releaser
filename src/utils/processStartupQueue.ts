import Database from "better-sqlite3";
import {processNextQueuedRelease} from "./processNextQueuedRelease";

export function processStartupQueue(db: Database.Database): void {
  try {
    // Reset any releases that were "running" when the app crashed
    const resetStmt = db.prepare(`
          UPDATE release_log
          SET release_status = 'failed',
              updated_at     = CURRENT_TIMESTAMP,
              ended_at       = CURRENT_TIMESTAMP
          WHERE release_status = 'running'
      `);
    const result = resetStmt.run();

    if (result.changes > 0) {
      console.log(`Reset ${result.changes} stuck releases to failed status`);
    }

    // Process queued releases
    processNextQueuedRelease(db);
  } catch (error) {
    console.error('Failed to process startup queue:', error);
    throw error;
  }
}