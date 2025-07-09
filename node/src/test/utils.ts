import Database from 'better-sqlite3';

// Helper function to create a test release in the queue
export function createTestRelease(testDb: Database.Database, commitSha: string, data: any = {}) {
  const defaultData = {
    commitSha,
    repository: 'test-repo',
    branch: 'main',
    environment: 'production',
    createdAt: new Date().toISOString(),
    ...data,
  };

  testDb.prepare(`
    INSERT INTO release_queue (commit_sha, repository, branch, environment, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    defaultData.commitSha,
    defaultData.repository,
    defaultData.branch,
    defaultData.environment,
    defaultData.createdAt
  );

  return defaultData;
}

// Helper function to create a test release state
export function createTestReleaseState(testDb: Database.Database, commitSha: string, data: any = {}) {
  const defaultData = {
    commitSha,
    status: 'pending',
    startedAt: new Date().toISOString(),
    ...data,
  };

  testDb.prepare(`
    INSERT INTO release_log (commit_sha, status, started_at)
    VALUES (?, ?, ?)
  `).run(
    defaultData.commitSha,
    defaultData.status,
    defaultData.startedAt
  );

  return defaultData;
}

// Helper function to get release from queue
export function getReleaseFromQueue(testDb: Database.Database, commitSha: string) {
  return testDb.prepare(`
    SELECT * FROM release_queue WHERE commit_sha = ?
  `).get(commitSha);
}

// Helper function to get release state
export function getReleaseState(testDb: Database.Database, commitSha: string) {
  return testDb.prepare(`
    SELECT * FROM release_log WHERE commit_sha = ?
  `).get(commitSha);
}

// Helper function to get all releases from queue
export function getAllReleasesFromQueue(testDb: Database.Database) {
  return testDb.prepare(`
    SELECT * FROM release_queue ORDER BY created_at ASC
  `).all();
}

// Helper function to get all release states
export function getAllReleaseStates(testDb: Database.Database) {
  return testDb.prepare(`
    SELECT * FROM release_log ORDER BY started_at ASC
  `).all();
} 