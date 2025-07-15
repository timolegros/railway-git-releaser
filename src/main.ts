import express from "express";
import { initializeDatabase } from "./database/db";
import { createRouter } from "./routes/router";
import { processQueue } from "./utils/processQueue";
import { failRunningReleasesOnStartup } from "./database/utils";
import { PORT, QUEUE_INTERVAL_MS, NODE_ENV, API_KEY } from "./config";

export function initApp(test: boolean = false) {
  const db = initializeDatabase();

  // Use Railway's PORT environment variable
  const port = PORT || 8080;
  const app = express();

  app.use(express.json());
  
  // API key middleware (exclude /healthcheck)
  app.use((req, res, next) => {
    if (req.path === "/healthcheck") {
      return next();
    }
    if (!API_KEY) {
      return res.status(401).json({ error: "Unauthorized: API key not set in environment variables" });
    }
    const apiKey = req.header("x-api-key");
    if (!apiKey || apiKey !== API_KEY) {
      return res.status(401).json({ error: "Unauthorized: Invalid or missing API key" });
    }
    next();
  });

  app.use("/", createRouter(db));

  let server;
  if (!test) {
    // Bind to :: (IPv6) for Railway private networking
    server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`HTTP server running on 0.0.0.0:${port}`);
    });
  }

  failRunningReleasesOnStartup(db);

  // Process queue immediately on startup
  processQueue(db);

  // Then process queue every 5 seconds
  const queueInterval = setInterval(() => {
    processQueue(db);
  }, QUEUE_INTERVAL_MS);

  return { app, db, server, queueInterval };
}

if (require.main === module) {
  // Global error handlers for Node.js
  process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
    process.exit(1);
  });

  process.on("uncaughtException", (error: Error) => {
    console.error("Uncaught Exception:", error);
    process.exit(1);
  });

  const { server, queueInterval } = initApp();

  // Improved graceful shutdown handling
  function gracefulShutdown(signal: string) {
    console.log(`Received ${signal}, shutting down gracefully...`);

    // Clear the queue interval
    if (queueInterval) {
      clearInterval(queueInterval);
    }

    // Close the server
    if (server) {
      server.close(() => {
        console.log("HTTP server closed");
        process.exit(0);
      });

      // Force close after 10 seconds
      setTimeout(() => {
        console.log("Forcing shutdown");
        process.exit(1);
      }, 10000);
    } else {
      process.exit(0);
    }
  }

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}