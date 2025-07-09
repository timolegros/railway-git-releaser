import {getReleaseMetrics} from "../database/utils";
import {Request, Response} from "express";
import Database from "better-sqlite3";

export function metrics(db: Database.Database, req: Request, res: Response) {
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
}