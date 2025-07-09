import express from 'express';
import {initializeDatabase} from './database/db';
import { createRouter } from './routes/router';
import { processStartupQueue } from './utils/processStartupQueue';

export function main() {
  const db = initializeDatabase();

  const port = 8000;
  const app = express();

  app.use(express.json());

  app.use('/', createRouter(db));

  app.listen(port, () => {
    console.log(`HTTP server running on port ${port}`);
  });

  processStartupQueue(db);
}

  // Global error handlers for Node.js
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });

  process.on('uncaughtException', (error: Error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
  });

  // Graceful shutdown handling
  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully...');
    process.exit(0);
  });

if (require.main === module) {
  main();
}
