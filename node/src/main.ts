import express from 'express';
import {spawn} from 'child_process';
import {initializeDatabase} from './database/db';
import Database from 'better-sqlite3';
import { ReleaseState } from './types';
import { isAnyReleaseRunning, addToQueue, removeFromQueue, getNextQueuedRelease, getQueueStatus, getReleaseState, updateReleaseStatus, insertReleaseLog, cleanupOldReleases, getReleaseMetrics } from './database/utils';
import { DEFAULT_CLEANUP_DAYS, RELEASE_TIMEOUT_MS } from './config';

let isProcessingQueue = false;

function processStartupQueue(db: Database.Database): void {
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

function tryAcquireGlobalReleaseLock(db: Database.Database, commitSha: string, priority: number = 0): {
  success: boolean;
  queued: boolean
} {
  // Use a transaction to ensure atomicity
  const transaction = db.transaction(() => {
    try {
      // Check if any release is currently running
      if (isAnyReleaseRunning(db)) {
        // Check if this commit is already in the queue
        const queueStmt = db.prepare('SELECT COUNT(*) as count FROM release_queue WHERE git_commit_sha = ?');
        const queueResult = queueStmt.get(commitSha) as { count: number };

        if (queueResult.count === 0) {
          // Add to queue
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
      console.error('Error in tryAcquireGlobalReleaseLock transaction:', error);
      throw error;
    }
  });

  return transaction();
}

function processNextQueuedRelease(db: Database.Database): void {
  if (isProcessingQueue) {
    console.log('Queue processing already in progress, skipping...');
    return;
  }

  try {
    const nextRelease = getNextQueuedRelease(db);
    if (nextRelease) {
      console.log(`Processing next queued release for commit: ${nextRelease.git_commit_sha}`);
      executeReleaseForCommit(nextRelease.git_commit_sha, db);
    }
  } catch (error) {
    console.error('Error processing next queued release:', error);
  }
}

async function executeReleaseForCommit(targetCommitSha: string, db: Database.Database) {
  isProcessingQueue = true;
  const startTime = new Date();

  console.log(`Executing release for commit ${targetCommitSha}...`);

  let state: ReleaseState;
  try {
    // Set the commit SHA environment variable for the clone script
    const childProcess = spawn('bash', ['clone.sh'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        RELEASER_GIT_COMMIT_SHA: targetCommitSha
      }
    });

    const code = await Promise.race([
      new Promise<number>((resolve, reject) => {
        childProcess.on('close', (code: number | null) => {
          resolve(code || 0);
        });
        childProcess.on('error', reject);
      }),
      new Promise<number>((_, reject) => {
        setTimeout(() => {
          childProcess.kill('SIGTERM');
          setTimeout(() => {
            if (!childProcess.killed) {
              childProcess.kill('SIGKILL');
            }
          }, 5000); // Give 5 seconds for graceful shutdown
          reject(new Error(`Release timed out after ${RELEASE_TIMEOUT_MS / 1000} seconds`));
        }, RELEASE_TIMEOUT_MS);
      })
    ]);

    state = code === 0 ? "success" : "failed";
    console.log(`Release for commit ${targetCommitSha} executed. Exit Code:`, code, "State:", state);
  } catch (err) {
    console.error(`Error running clone.sh for commit ${targetCommitSha}:`, err);
    state = "failed";
  }

  const endTime = new Date();

  try {
    // Update release log with final result
    updateReleaseStatus(db, targetCommitSha, state, endTime);

    // Remove from queue if it was there
    removeFromQueue(db, targetCommitSha);

    console.log(`Release log updated for commit ${targetCommitSha}:`, state);

    // Log duration
    const duration = endTime.getTime() - startTime.getTime();
    console.log(`Release duration: ${Math.round(duration / 1000)} seconds`);
  } catch (error) {
    console.error(`Error updating release status for ${targetCommitSha}:`, error);
  } finally {
    isProcessingQueue = false;

    // Process next queued release if any
    processNextQueuedRelease(db);
  }
}

export function main() {
  const db = initializeDatabase();

  // Process any queued releases on startup
  processStartupQueue(db);

  // Setup periodic cleanup (run every 24 hours)
  setInterval(() => {
    try {
      cleanupOldReleases(db, DEFAULT_CLEANUP_DAYS);
    } catch (error) {
      console.error('Error during periodic cleanup:', error);
    }
  }, 24 * 60 * 60 * 1000);

  const port = 8000;
  const app = express();

  // Add JSON body parsing middleware
  app.use(express.json());

  // Enhanced health check
  app.get('/healthcheck', (req, res) => {
    try {
      const queueStatus = getQueueStatus(db);

      res.status(200).json({
        status: 'OK',
        isReleaseRunning: queueStatus.isRunning,
        queueLength: queueStatus.queueLength,
        timestamp: new Date().toISOString(),
        isProcessingQueue
      });
    } catch (error) {
      console.error('Error in healthcheck:', error);
      res.status(500).json({
        status: 'ERROR',
        error: 'Database error',
        timestamp: new Date().toISOString()
      });
    }
  });

  app.post('/triggerRelease', async (req, res) => {
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
      const lockResult = tryAcquireGlobalReleaseLock(db, requestCommitSha, priority);

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
  });

  app.get('/releaseState', async (req, res) => {
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
  });

  app.get('/queueStatus', async (req, res) => {
    try {
      const queueStatus = getQueueStatus(db);
      return res.status(200).json(queueStatus);
    } catch (error) {
      console.error('Error getting queue status:', error);
      res.status(500).json({error: 'Internal Server Error'});
    }
  });

  // New endpoint for release metrics
  app.get('/metrics', async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const metrics = getReleaseMetrics(db, days);

      return res.status(200).json({
        period: `${days} days`,
        metrics
      });
    } catch (error) {
      console.error('Error getting release metrics:', error);
      res.status(500).json({error: 'Internal Server Error'});
    }
  });

  // New endpoint for manual cleanup
  app.post('/cleanup', async (req, res) => {
    try {
      const {days = DEFAULT_CLEANUP_DAYS} = req.body;

      cleanupOldReleases(db, days);

      return res.status(200).json({
        message: `Cleanup completed for releases older than ${days} days`
      });
    } catch (error) {
      console.error('Error during manual cleanup:', error);
      res.status(500).json({error: 'Internal Server Error'});
    }
  });

  // New endpoint to cancel queued releases
  app.delete('/queue/:commitSha', async (req, res) => {
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
  });

  // Global error handlers for Node.js
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });

  process.on('uncaughtException', (error: Error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
  });

  // Graceful shutdown handling
  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully...');
    process.exit(0);
  });

  // Start HTTP server
  app.listen(port, () => {
    console.log(`HTTP server running on port ${port}`);
  });
}

if (require.main === module) {
  main();
}
