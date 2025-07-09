import {Request, Response} from "express";
import Database from "better-sqlite3";
import {getQueueStatus} from "../database/utils";

export function queueStatus(db: Database.Database, req: Request, res: Response) {
  try {
    const queueStatus = getQueueStatus(db);
    return res.status(200).json(queueStatus);
  } catch (error) {
    console.error('Error getting queue status:', error);
    res.status(500).json({error: 'Internal Server Error'});
  }
}