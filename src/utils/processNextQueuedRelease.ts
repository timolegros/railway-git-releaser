import {getNextQueuedRelease} from "../database/utils";
import {executeReleaseForCommit, isProcessingQueue} from "./executeRelease";
import Database from "better-sqlite3";

export function processNextQueuedRelease(db: Database.Database): void {
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