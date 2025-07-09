import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const migrationsDir = path.join(__dirname, 'migrations');

export function runMigrations(db: Database.Database) {
  db.exec(`
      CREATE TABLE IF NOT EXISTS migrations
      (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          filename TEXT UNIQUE,
          applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
  `);

  const appliedMigrations = db.prepare('SELECT filename FROM migrations').all().map((row) => (row as { filename: string }).filename);

  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();

  // Run pending migrations
  for (const file of migrationFiles) {
    if (appliedMigrations.includes(file)) {
      console.log(`⏭ Skipping ${file} (already applied)`);
      continue;
    }

    console.log(`🔄 Running migration: ${file}`);

    const migrationSql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    // Run migration in transaction
    const runMigration = db.transaction(() => {
      db.exec(migrationSql);
      db.prepare('INSERT INTO migrations (filename) VALUES (?)').run(file);
    });

    runMigration();
    console.log(`✅ Migration ${file} completed`);
  }
}