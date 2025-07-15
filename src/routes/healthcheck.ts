import {Request, Response} from "express";

export const healthcheck = (req: Request, res: Response) => {
  try {
    res.sendStatus(200);
  } catch (error) {
    console.error('Error in healthcheck:', error);
    res.sendStatus(500);
  }
}