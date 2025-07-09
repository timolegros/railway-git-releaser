CREATE TABLE IF NOT EXISTS release_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    git_commit_sha TEXT UNIQUE NOT NULL,
    git_commit_url TEXT NOT NULL,
    queued_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    priority INTEGER DEFAULT 0 NOT NULL,
    FOREIGN KEY (git_commit_sha) REFERENCES release_log(git_commit_sha)
); 