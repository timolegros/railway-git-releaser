CREATE INDEX IF NOT EXISTS idx_release_log_status ON release_log(release_status);
CREATE INDEX IF NOT EXISTS idx_release_log_created_at ON release_log(created_at);
CREATE INDEX IF NOT EXISTS idx_release_queue_priority_queued ON release_queue(priority DESC, queued_at ASC);