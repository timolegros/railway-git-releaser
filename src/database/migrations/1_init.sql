CREATE TABLE IF NOT EXISTS release_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    git_commit_url TEXT NOT NULL,
    git_commit_sha TEXT UNIQUE NOT NULL,
    release_status TEXT NOT NULL,
    queued_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    started_at DATETIME,
    ended_at DATETIME
);