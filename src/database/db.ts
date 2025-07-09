import Database from "better-sqlite3";
import { runMigrations } from "./migrationRunner";
import { SQLITE_DB_PATH } from "../config";

export function initializeDatabase() {
    try {
      const db = new Database(SQLITE_DB_PATH);
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