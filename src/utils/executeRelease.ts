import {spawn} from "child_process";
import {NODE_ENV, RELEASE_TIMEOUT_MS, GRACEFUL_SHUTDOWN_MS} from "../config";
import {ReleaseState} from "../types";
import Database from "better-sqlite3";
import {updateReleaseStatus} from "../database/utils";
import { getReleaseScriptFilePath } from "./getReleaseScriptFilePath";

export let isReleaseRunning = false;

// Custom error for release timeouts
export class ReleaseTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Release timed out after ${timeoutMs / 1000} seconds`);
    this.name = 'ReleaseTimeoutError';
  }
}

export async function executeReleaseForCommit(targetCommitSha: string, db: Database.Database) {
  isReleaseRunning = true;
  const startTime = new Date();

  const changes = updateReleaseStatus({
    db,
    commitSha: targetCommitSha,
    status: "running",
    startedAt: startTime,
  });
  if (changes === 0) {
    console.warn(`No queued release found for commit ${targetCommitSha}. Release may have been cancelled.`);
    return;
  }

  console.log(`Executing release for commit ${targetCommitSha}...`);

  const releaseScriptFilePath = getReleaseScriptFilePath();
  NODE_ENV === 'test' && console.log(`Using release script file: ${releaseScriptFilePath}`);

  let state: ReleaseState;
  let endedAt: Date;
  try {
    // Set the commit SHA environment variable for the clone script
    const childProcess = spawn('bash', [releaseScriptFilePath], {
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
          }, GRACEFUL_SHUTDOWN_MS); // Wait for graceful shutdown
          reject(new ReleaseTimeoutError(RELEASE_TIMEOUT_MS));
        }, RELEASE_TIMEOUT_MS);
      })
    ]);
    endedAt = new Date();

    state = code === 0 ? "success" : "failed";
    console.log(`Release for commit ${targetCommitSha} executed. Exit Code:`, code, "State:", state);
  } catch (err) {
    endedAt = new Date();
    if (err instanceof ReleaseTimeoutError) {
      console.error(`Release timed out for commit ${targetCommitSha}:`, err);
      state = "timeout";
    } else {
      console.error(`Error running clone.sh for commit ${targetCommitSha}:`, err);
      state = "failed";
    }
  }

  updateReleaseStatus({
    db,
    commitSha: targetCommitSha,
    status: state,
    endedAt,
  });
  const duration = endedAt.getTime() - startTime.getTime();
  console.log(`Release duration: ${Math.round(duration)} ms`);
  isReleaseRunning = false;
}