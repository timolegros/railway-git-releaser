import Database from "better-sqlite3";
import { runMigrations } from "./migrationRunner";
import { SQLITE_DB_PATH } from "../config";
import path from "path";
import fs from "fs";

export function initializeDatabase() {
    try {
      const dbPath = path.join(process.cwd(), SQLITE_DB_PATH);
      const dbDir = path.dirname(dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
      console.log('🔧 Initializing database with path:', dbPath);
      const db = new Database(dbPath);
      db.pragma('foreign_keys = ON');
      console.log('🔧 Running database migrations...');
      runMigrations(db);
      console.log('✅ Database ready');
      return db;
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      process.exit(1);
    }
  }