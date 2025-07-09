import Database from 'better-sqlite3';
import {ReleaseState} from '../types';
import {DEFAULT_CLEANUP_DAYS} from '../config';

export function getReleaseState(db: Database.Database, commitSha: string): ReleaseState {
  try {
    const stmt = db.prepare('SELECT release_status FROM release_log WHERE git_commit_sha = ?');
    const result = stmt.get(commitSha) as { release_status: ReleaseState } | undefined;
    return result ? result.release_status : 'not_started';
  } catch (error) {
    console.error(`Failed to get release state for ${commitSha}:`, error);
    throw error;
  }
}

export function insertReleaseLog(db: Database.Database, commitSha: string, status: ReleaseState, startTime?: Date): void {
  try {
    const stmt = db.prepare(`
        INSERT INTO release_log (git_commit_url, git_commit_sha, release_status, started_at)
        VALUES (?, ?, ?, ?)
    `);
    stmt.run(
      `https://github.com/commit/${commitSha}`,
      commitSha,
      status,
      startTime?.toISOString() || new Date().toISOString()
    );
  } catch (error) {
    console.error(`Failed to insert release log for ${commitSha}:`, error);
    throw error;
  }
}

export function updateReleaseStatus(db: Database.Database, commitSha: string, status: ReleaseState, endTime?: Date): void {
  try {
    const stmt = db.prepare(`
        UPDATE release_log
        SET release_status = ?,
            updated_at     = CURRENT_TIMESTAMP,
            ended_at       = ?
        WHERE git_commit_sha = ?
    `);
    const result = stmt.run(status, endTime?.toISOString(), commitSha);

    if (result.changes === 0) {
      console.warn(`No release log found for commit ${commitSha} when updating to ${status}`);
    }
  } catch (error) {
    console.error(`Failed to update release status for ${commitSha}:`, error);
    throw error;
  }
}

export function isAnyReleaseRunning(db: Database.Database): boolean {
  try {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM release_log WHERE release_status = ?');
    const result = stmt.get('running') as { count: number };
    return result.count > 0;
  } catch (error) {
    console.error('Failed to check if any release is running:', error);
    throw error;
  }
}

export function addToQueue(db: Database.Database, commitSha: string, priority: number = 0): void {
  try {
    const stmt = db.prepare(`
        INSERT
            OR IGNORE
        INTO release_queue (git_commit_sha, git_commit_url, priority)
        VALUES (?, ?, ?)
    `);
    stmt.run(commitSha, `https://github.com/commit/${commitSha}`, priority);
  } catch (error) {
    console.error(`Failed to add ${commitSha} to queue:`, error);
    throw error;
  }
}

export function removeFromQueue(db: Database.Database, commitSha: string): void {
  try {
    const stmt = db.prepare('DELETE FROM release_queue WHERE git_commit_sha = ?');
    stmt.run(commitSha);
  } catch (error) {
    console.error(`Failed to remove ${commitSha} from queue:`, error);
    throw error;
  }
}

export function getNextQueuedRelease(db: Database.Database): { git_commit_sha: string } | undefined {
  try {
    const stmt = db.prepare(`
        SELECT git_commit_sha
        FROM release_queue
        ORDER BY priority DESC, queued_at ASC
        LIMIT 1
    `);
    return stmt.get() as { git_commit_sha: string } | undefined;
  } catch (error) {
    console.error('Failed to get next queued release:', error);
    throw error;
  }
}

export function getQueueStatus(db: Database.Database): {
  isRunning: boolean;
  queueLength: number;
  queue: Array<{ git_commit_sha: string; queued_at: string; priority: number }>
} {
  try {
    const stmt = db.prepare(`
        SELECT git_commit_sha, queued_at, priority
        FROM release_queue
        ORDER BY priority DESC, queued_at ASC
    `);
    const queue = stmt.all() as Array<{ git_commit_sha: string; queued_at: string; priority: number }>;

    const isRunning = isAnyReleaseRunning(db);

    return {
      isRunning,
      queueLength: queue.length,
      queue: queue
    };
  } catch (error) {
    console.error('Failed to get queue status:', error);
    throw error;
  }
}

export function getReleaseMetrics(db: Database.Database, days: number = 7): any {
  try {
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
        WHERE created_at >= datetime('now', '-${days} days')
        GROUP BY release_status
    `);

    const metrics = stmt.all();
    return metrics;
  } catch (error) {
    console.error('Failed to get release metrics:', error);
    throw error;
  }
}

export function cleanupOldReleases(db: Database.Database, daysToKeep: number = DEFAULT_CLEANUP_DAYS): void {
  try {
    const stmt = db.prepare(`
        DELETE
        FROM release_log
        WHERE created_at < datetime('now', '-${daysToKeep} days')
          AND release_status IN ('success', 'failed')
    `);
    const result = stmt.run();
    console.log(`Cleaned up ${result.changes} old release records`);
  } catch (error) {
    console.error('Failed to cleanup old releases:', error);
    throw error;
  }
}