import Database from "better-sqlite3";
import { getNextQueuedRelease } from "../database/utils";
import { executeReleaseForCommit, isReleaseRunning } from "./executeRelease";

export function processQueue(db: Database.Database) {
    if (isReleaseRunning) return;
  
    const release = getNextQueuedRelease(db);
    if (!release) return;
  
    executeReleaseForCommit(release.git_commit_sha, db);
  }