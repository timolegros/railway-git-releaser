CREATE INDEX IF NOT EXISTS idx_release_log_status ON release_log(release_status);
CREATE INDEX IF NOT EXISTS idx_release_log_queued_at ON release_log(queued_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_running_release ON release_log(release_status) WHERE release_status = 'running';