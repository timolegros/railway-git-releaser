import Database from "better-sqlite3";
import { ReleaseLogItem, ReleaseState } from "../types";

export function getReleaseState(
  db: Database.Database,
  commitSha: string
): ReleaseState | undefined {
  try {
    const stmt = db.prepare(
      "SELECT release_status FROM release_log WHERE git_commit_sha = ?"
    );
    const result = stmt.get(commitSha) as
      | { release_status: ReleaseState }
      | undefined;
    return result?.release_status;
  } catch (error) {
    console.error(`Failed to get release state for ${commitSha}:`, error);
    throw error;
  }
}

export function updateReleaseStatus({
  db,
  commitSha,
  status,
  endedAt,
  startedAt,
}: {
  db: Database.Database,
  commitSha: string,
  status: ReleaseState,
  endedAt?: Date,
  startedAt?: Date
}
): number {
  try {
    const stmt = db.prepare(`
        UPDATE release_log
        SET release_status = @status
            ${endedAt ? `, ended_at = @endedAt` : ''}
            ${startedAt ? `, started_at = @startedAt` : ''}
        WHERE git_commit_sha = @commitSha
    `);
    const result = stmt.run({
      status,
      commitSha,
      endedAt: endedAt?.toISOString(),
      startedAt: startedAt?.toISOString(),
    });

    return result.changes;
  } catch (error) {
    console.error(`Failed to update release status for ${commitSha}:`, error);
    throw error;
  }
}

export function isAnyReleaseRunning(db: Database.Database): boolean {
  try {
    const stmt = db.prepare(
      "SELECT COUNT(*) as count FROM release_log WHERE release_status = ?"
    );
    const result = stmt.get("running") as { count: number };
    return result.count > 0;
  } catch (error) {
    console.error("Failed to check if any release is running:", error);
    throw error;
  }
}

export function addToQueue(db: Database.Database, commitSha: string): void {
  try {
    const stmt = db.prepare(`
        INSERT
            OR IGNORE
        INTO release_log (git_commit_url, git_commit_sha, release_status)
        VALUES (?, ?, ?)
    `);
    stmt.run(`https://github.com/commit/${commitSha}`, commitSha, "queued");
  } catch (error) {
    console.error(`Failed to add ${commitSha} to queue:`, error);
    throw error;
  }
}

export function removeFromQueue(
  db: Database.Database,
  commitSha: string
): void {
  try {
    const stmt = db.prepare(
      "DELETE FROM release_log WHERE git_commit_sha = ? AND release_status = 'queued'"
    );
    stmt.run(commitSha);
  } catch (error) {
    console.error(`Failed to remove ${commitSha} from queue:`, error);
    throw error;
  }
}

export function getNextQueuedRelease(
  db: Database.Database
): ReleaseLogItem | undefined {
  try {
    const stmt = db.prepare(`
        SELECT *
        FROM release_log
        WHERE release_status = 'queued'
        ORDER BY queued_at ASC
        LIMIT 1;
    `);
    return stmt.get() as ReleaseLogItem | undefined;
  } catch (error) {
    console.error("Failed to get next queued release:", error);
    throw error;
  }
}

export function searchReleaseLog(
  db: Database.Database,
  commitSha: string
): ReleaseLogItem | undefined {
  try {
    const stmt = db.prepare(
      "SELECT * FROM release_log WHERE git_commit_sha = ?;"
    );
    const result = stmt.get(commitSha) as ReleaseLogItem | undefined;
    return result;
  } catch (error) {
    console.error(`Failed to search release log for ${commitSha}:`, error);
    throw error;
  }
}

export function getQueueLength(db: Database.Database): number {
  try {
    const stmt = db.prepare(
      `SELECT COUNT(*) as count
       FROM release_log
       WHERE release_status = 'queued'`
    );
    const result = stmt.get() as { count: number };
    return result.count;
  } catch (error) {
    console.error("Failed to get queue length:", error);
    throw error;
  }
}

export function failRunningReleasesOnStartup(db: Database.Database) {
  try {
    const stmt = db.prepare(
      `UPDATE release_log
       SET release_status = 'failed',
           ended_at       = CURRENT_TIMESTAMP
       WHERE release_status = 'running'`
    );
    const result = stmt.run();

    if (result.changes > 0) {
      console.log(`Reset ${result.changes} stuck releases to failed status`);
    }
  } catch (error) {
    console.error(
      'Failed to set "failed" status for running releases on startup:',
      error
    );
    throw error;
  }
}
