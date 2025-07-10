import {getQueueLength} from "../database/utils";
import {Request, Response} from "express";
import Database from "better-sqlite3";
import {isReleaseRunning} from "../utils/executeRelease";

export const healthcheck = (db: Database.Database, req: Request, res: Response) => {
  try {
    res.status(200).json({
      status: 'OK',
      isReleaseRunning: isReleaseRunning,
      queueLength: getQueueLength(db),
    });
  } catch (error) {
    console.error('Error in healthcheck:', error);
    res.status(500).json({
      status: 'ERROR',
      error: 'Database error',
    });
  }
}