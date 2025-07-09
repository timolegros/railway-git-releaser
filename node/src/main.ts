import express from 'express';
import { spawn } from 'child_process';
import { initializeDatabase } from './database/db';
import Database from 'better-sqlite3';

// Type definitions for release states
type ReleaseState = 'not_started' | 'running' | 'success' | 'failed' | 'queued';

// Global error handlers for Node.js
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Database operations
function getReleaseState(db: Database.Database, commitSha: string): ReleaseState {
  const stmt = db.prepare('SELECT release_status FROM release_log WHERE git_commit_sha = ?');
  const result = stmt.get(commitSha) as { release_status: ReleaseState } | undefined;
  return result ? result.release_status : 'not_started';
}

function insertReleaseLog(db: Database.Database, commitSha: string, status: ReleaseState): void {
  const stmt = db.prepare(`
    INSERT INTO release_log (git_commit_url, git_commit_sha, release_status) 
    VALUES (?, ?, ?)
  `);
  stmt.run(`https://github.com/commit/${commitSha}`, commitSha, status);
}

function updateReleaseStatus(db: Database.Database, commitSha: string, status: ReleaseState): void {
  const stmt = db.prepare(`
    UPDATE release_log 
    SET release_status = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE git_commit_sha = ?
  `);
  stmt.run(status, commitSha);
}

function isAnyReleaseRunning(db: Database.Database): boolean {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM release_log WHERE release_status = ?');
  const result = stmt.get('running') as { count: number };
  return result.count > 0;
}

function addToQueue(db: Database.Database, commitSha: string): void {
  const stmt = db.prepare(`
    INSERT INTO release_queue (git_commit_sha, git_commit_url) 
    VALUES (?, ?)
  `);
  stmt.run(commitSha, `https://github.com/commit/${commitSha}`);
}

function removeFromQueue(db: Database.Database, commitSha: string): void {
  const stmt = db.prepare('DELETE FROM release_queue WHERE git_commit_sha = ?');
  stmt.run(commitSha);
}

function getNextQueuedRelease(db: Database.Database): { git_commit_sha: string } | undefined {
  const stmt = db.prepare(`
    SELECT git_commit_sha 
    FROM release_queue 
    ORDER BY queued_at ASC 
    LIMIT 1
  `);
  return stmt.get() as { git_commit_sha: string } | undefined;
}

function tryAcquireGlobalReleaseLock(db: Database.Database, commitSha: string): { success: boolean; queued: boolean } {
  // Use a transaction to ensure atomicity
  const transaction = db.transaction(() => {
    // Check if any release is currently running
    if (isAnyReleaseRunning(db)) {
      // Check if this commit is already in the queue
      const queueStmt = db.prepare('SELECT COUNT(*) as count FROM release_queue WHERE git_commit_sha = ?');
      const queueResult = queueStmt.get(commitSha) as { count: number };
      
      if (queueResult.count === 0) {
        // Add to queue
        addToQueue(db, commitSha);
      }
      
      return { success: false, queued: true };
    }
    
    // Check if this commit has already been processed
    const existingStmt = db.prepare('SELECT release_status FROM release_log WHERE git_commit_sha = ?');
    const existing = existingStmt.get(commitSha) as { release_status: ReleaseState } | undefined;
    
    if (existing && existing.release_status === 'running') {
      return { success: false, queued: false }; // Already running this specific commit
    }
    
    if (existing) {
      // Update existing record to running
      updateReleaseStatus(db, commitSha, 'running');
    } else {
      // Insert new record with running status
      insertReleaseLog(db, commitSha, 'running');
    }
    
    return { success: true, queued: false }; // Successfully acquired lock
  });
  
  return transaction();
}

function processNextQueuedRelease(db: Database.Database): void {
  const nextRelease = getNextQueuedRelease(db);
  if (nextRelease) {
    console.log(`Processing next queued release for commit: ${nextRelease.git_commit_sha}`);
    executeReleaseForCommit(nextRelease.git_commit_sha, db);
  }
}

export function main() {
  const db = initializeDatabase();
  
  const port = 8000;
  const app = express();

  // Add JSON body parsing middleware
  app.use(express.json());

  // Setup routes
  app.get('/healthcheck', (req, res) => {
    res.status(200).send('OK');
  });

  app.post('/triggerRelease', async (req, res) => {
    try {
      const { commitSha: requestCommitSha } = req.body;

      if (!requestCommitSha) {
        return res.status(400).json({ error: 'Missing commit-sha in request body' });
      }

      // Try to acquire global lock for this commit
      const lockResult = tryAcquireGlobalReleaseLock(db, requestCommitSha);
      
      if (!lockResult.success) {
        if (lockResult.queued) {
          const existingState = getReleaseState(db, requestCommitSha);
          return res.status(202).json({ 
            message: `Release for commit ${requestCommitSha} has been queued`,
            state: existingState === 'not_started' ? 'queued' : existingState
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
        state: 'running'
      });
    } catch (error) {
      console.error('Error triggering release:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.get('/releaseState', async (req, res) => {
    try {
      const commitSha = req.query['commit-sha'] as string;

      if (!commitSha) {
        return res.status(400).send('Missing commit-sha parameter');
      }

      const state = getReleaseState(db, commitSha);
      return res.status(200).json(state);
    } catch (error) {
      console.error('Error handling request:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  app.get('/queueStatus', async (req, res) => {
    try {
      const stmt = db.prepare(`
        SELECT git_commit_sha, queued_at 
        FROM release_queue 
        ORDER BY queued_at ASC
      `);
      const queue = stmt.all() as Array<{ git_commit_sha: string; queued_at: string }>;
      
      const isRunning = isAnyReleaseRunning(db);
      
      return res.status(200).json({
        isRunning,
        queueLength: queue.length,
        queue: queue
      });
    } catch (error) {
      console.error('Error getting queue status:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  // Start HTTP server and keep process alive
  app.listen(port, () => {
    console.log(`HTTP server running on port ${port}`);
  });
}

async function executeReleaseForCommit(targetCommitSha: string, db: Database.Database) {
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
    
    const code = await new Promise<number>((resolve, reject) => {
      childProcess.on('close', (code: number | null) => {
        resolve(code || 0);
      });
      childProcess.on('error', reject);
    });
    
    state = code === 0 ? "success" : "failed";
    console.log(`Release for commit ${targetCommitSha} executed. Exit Code:`, code, "State:", state);
  } catch (err) {
    console.error(`Error running clone.sh for commit ${targetCommitSha}:`, err);
    state = "failed";
  }

  // Update release log with final result
  updateReleaseStatus(db, targetCommitSha, state);
  
  // Remove from queue if it was there
  removeFromQueue(db, targetCommitSha);
  
  console.log(`Release log updated for commit ${targetCommitSha}:`, state);
  
  // Process next queued release if any
  processNextQueuedRelease(db);
}

if (require.main === module) {
  main();
}
