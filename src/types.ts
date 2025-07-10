// Type definitions for release states
export type ReleaseState = 'running' | 'success' | 'failed' | 'timeout' | 'queued';

export type ReleaseLogItem = {
  id: number;
  git_commit_url: string;
  git_commit_sha: string;
  release_status: ReleaseState;
  queued_at: string;
  started_at: string;
  ended_at: string;
}