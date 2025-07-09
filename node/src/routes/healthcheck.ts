import {getQueueStatus} from "../database/utils";
import {Request, Response} from "express";
import Database from "better-sqlite3";
import {isProcessingQueue} from "../utils/executeRelease";

export const healthcheck = (db: Database.Database, req: Request, res: Response) => {
  console.log('Healthcheck called', db);
  try {
    const queueStatus = getQueueStatus(db);

    res.status(200).json({
      status: 'OK',
      isReleaseRunning: queueStatus.isRunning,
      queueLength: queueStatus.queueLength,
      isProcessingQueue
    });
  } catch (error) {
    console.error('Error in healthcheck:', error);
    res.status(500).json({
      status: 'ERROR',
      error: 'Database error',
    });
  }
}