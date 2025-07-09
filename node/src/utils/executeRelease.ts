import {spawn} from "child_process";
import {RELEASE_TIMEOUT_MS} from "../config";
import {ReleaseState} from "../types";
import Database from "better-sqlite3";
import {removeFromQueue, updateReleaseStatus} from "../database/utils";
import {processNextQueuedRelease} from "./processNextQueuedRelease";

export let isProcessingQueue = false;

export async function executeReleaseForCommit(targetCommitSha: string, db: Database.Database) {
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