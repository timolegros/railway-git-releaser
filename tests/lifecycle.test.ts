import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  vi,
  beforeEach,
  MockInstance,
} from "vitest";
import * as getReleaseScriptFilePath from "../src/utils/getReleaseScriptFilePath";
import * as executeReleaseForCommit from "../src/utils/executeRelease";
import request from "supertest";
import express from "express";
import Database from "better-sqlite3";
import path from "path";
import {isReleaseRunning} from "../src/utils/executeRelease";
import {
  GRACEFUL_SHUTDOWN_MS,
  QUEUE_INTERVAL_MS,
  RELEASE_TIMEOUT_MS,
} from "../src/config";
import {initApp} from "../src/main";
import {generateRandomGitHash} from "./utils/utils";
import {
  addToQueue,
  getReleaseState,
  searchReleaseLog,
  updateReleaseStatus,
} from "../src/database/utils";
import {ReleaseLogItem, ReleaseState} from "../src/types";

const filepathMock = vi.spyOn(
  getReleaseScriptFilePath,
  "getReleaseScriptFilePath"
);
const executeReleaseMock = vi.spyOn(
  executeReleaseForCommit,
  "executeReleaseForCommit"
);

const awaitSpyResult = async (spy: MockInstance<(targetCommitSha: string, db: Database.Database) => Promise<void>>, callIndex = 0) => {
  // Wait for the spy to be called
  await vi.waitFor(
    () => {
      expect(spy).toHaveBeenCalled();
    },
    {
      timeout: 1000,
      interval: 20,
    }
  );

  // Get the return value from the specific call
  const returnValue = spy.mock.results[callIndex]?.value;

  // If it's a promise, await it
  if (returnValue && typeof returnValue.then === "function") {
    return await returnValue;
  }

  return returnValue;
};

let db: Database.Database;

const commitSha = "6765f2fd3380e0c2e24c5255d96250df8d0b713d";

describe("API Routes", () => {
  let app: express.Application;
  const randomCommitSha = generateRandomGitHash();
  const randomCommitSha2 = generateRandomGitHash();
  const randomCommitSha3 = generateRandomGitHash();

  beforeAll(() => {
    vi.useFakeTimers();
    const { app: testApp, db: testDb } = initApp(true);
    app = testApp;
    db = testDb;
    expect(executeReleaseMock).not.toHaveBeenCalled();
    expect(isReleaseRunning).toBe(false);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    if (db) {
      console.log("Closing test database");
      db.close();
    }
  });

  describe("GET /healthcheck", () => {
    it("should return 200 OK", async () => {
      const response = await request(app).get("/healthcheck");
      expect(response.status).toBe(200);
      expect(response.body.status).toBe("OK");
      expect(response.body.isReleaseRunning).toBe(false);
      expect(response.body.queueLength).toBe(0);
    });
  });

  describe("Queue Lifecycle", () => {
    describe("POST /queue", () => {
      it("should fail if the commit SHA is invalid", async () => {
        let response = await request(app).post("/queue").send({
          commitSha: "invalid",
        });
        expect(response.status).toBe(400);
        expect(response.body.error).toBe("Invalid commit SHA format");
        response = await request(app).post("/queue").send({});
        expect(response.status).toBe(400);
        expect(response.body.error).toBe("Commit SHA is required");
      });

      // it('should fail if the repository is invalid', async () => {
      //   const response = await request(app).post('/queue').send({
      //     commitSha: '1234567890',
      //     repository: 'invalid',
      //   });
      //   expect(response.status).toBe(400);
      //   expect(response.body.error).toBe('Invalid repository format');
      // });

      it("should queue a release", async () => {
        const response = await request(app).post("/queue").send({
          commitSha: randomCommitSha,
        });
        expect(response.status).toBe(200);
        expect(response.body.message).toBe(
          `Release queued for commit ${randomCommitSha}`
        );
        expect(response.body.state).toBe("queued");
      });

      it("should fail to queue the same release more than once", async () => {
        const response = await request(app).post("/queue").send({
          commitSha: randomCommitSha,
        });
        expect(response.status).toBe(202);
        expect(response.body.message).toBe(
          `Release for commit ${randomCommitSha} exists with status queued`
        );
        expect(response.body.state).toBe("queued");
      });

      it("should queue multiple releases", async () => {
        filepathMock.mockReturnValue(
          path.join(__dirname, "./utils/passing-release.sh")
        );
        const response = await request(app).post("/queue").send({
          commitSha: randomCommitSha2,
        });
        expect(response.status).toBe(200);
        expect(response.body.message).toBe(
          `Release queued for commit ${randomCommitSha2}`
        );
        expect(response.body.state).toBe("queued");

        const response2 = await request(app).post("/queue").send({
          commitSha: randomCommitSha3,
        });
        expect(response2.status).toBe(200);
        expect(response2.body.message).toBe(
          `Release queued for commit ${randomCommitSha3}`
        );
        expect(response2.body.state).toBe("queued");

        const response3 = await request(app).post("/queue").send({
          commitSha: randomCommitSha3,
        });
        expect(response3.status).toBe(202);
        expect(response3.body.message).toBe(
          `Release for commit ${randomCommitSha3} exists with status queued`
        );
        expect(response3.body.state).toBe("queued");
      });

      it('should return 202 when queueing a release that is already running, failed, success, or timeout', async () => {
        updateReleaseStatus({
          db,
          commitSha: randomCommitSha,
          status: "running",
          startedAt: new Date(),
        });
        const response = await request(app).post("/queue").send({
          commitSha: randomCommitSha,
        });
        expect(response.status).toBe(202);
        expect(response.body.message).toBe(
          `Release for commit ${randomCommitSha} exists with status running`
        );
        expect(response.body.state).toBe("running");

        updateReleaseStatus({
          db,
          commitSha: randomCommitSha,
          status: "failed",
          startedAt: new Date(),
        });
        const response2 = await request(app).post("/queue").send({
          commitSha: randomCommitSha,
        });
        expect(response2.status).toBe(202);
        expect(response2.body.message).toBe(
          `Release for commit ${randomCommitSha} exists with status failed`
        );
        expect(response2.body.state).toBe("failed");

        updateReleaseStatus({
          db,
          commitSha: randomCommitSha,
          status: "success",
          startedAt: new Date(),
        });
        const response3 = await request(app).post("/queue").send({
          commitSha: randomCommitSha,
        });
        expect(response3.status).toBe(202);
        expect(response3.body.message).toBe(
          `Release for commit ${randomCommitSha} exists with status success`
        );
        expect(response3.body.state).toBe("success");

        updateReleaseStatus({
          db,
          commitSha: randomCommitSha,
          status: "timeout",
          startedAt: new Date(),
        });
        const response4 = await request(app).post("/queue").send({
          commitSha: randomCommitSha,
        });
        expect(response4.status).toBe(202);
        expect(response4.body.message).toBe(
          `Release for commit ${randomCommitSha} exists with status timeout`
        );
        expect(response4.body.state).toBe("timeout");
      });
    });

    describe("GET /queue", () => {
      it("should return queue status", async () => {
        const response = await request(app).get("/queue");
        expect(response.status).toBe(200);
        // randomCommitSha is not in the queue because state was updated in previous test
        expect(response.body.queueLength).toBe(2);
        expect(response.body.queue).toEqual([
          { git_commit_sha: randomCommitSha2, queued_at: expect.any(String) },
          { git_commit_sha: randomCommitSha3, queued_at: expect.any(String) },
        ]);
      });
    });

    describe("DELETE /queue/:commitSha", () => {
      it("should return 404 for non-existent commit", async () => {
        const nonExistentCommitSha = generateRandomGitHash();
        const response = await request(app).delete(
          `/queue/${nonExistentCommitSha}`
        );
        expect(response.status).toBe(404);
        expect(response.body.error).toBe(
          `Release for commit ${nonExistentCommitSha} not found`
        );
      });

      it("should return 404 if a commit SHA is not provided", async () => {
        const response = await request(app).delete(`/queue/`);
        expect(response.status).toBe(404);
        expect(response.body.error).toBe("Not found");
      });

      it("should return 409 if a release is running, failed, success, or timeout", async () => {
        updateReleaseStatus({
          db,
          commitSha: randomCommitSha,
          status: "running",
          startedAt: new Date(),
        });
        let response = await request(app).delete(`/queue/${randomCommitSha}`);
        expect(response.status).toBe(409);
        expect(response.body.error).toBe(
          `Can only cancel queued releases`
        );

        updateReleaseStatus({
          db,
          commitSha: randomCommitSha,
          status: "failed",
          startedAt: new Date(),
        });
        response = await request(app).delete(`/queue/${randomCommitSha}`);
        expect(response.status).toBe(409);
        expect(response.body.error).toBe(
          `Can only cancel queued releases`
        );

        updateReleaseStatus({
          db,
          commitSha: randomCommitSha,
          status: "success",
          startedAt: new Date(),
        });
        response = await request(app).delete(`/queue/${randomCommitSha}`);
        expect(response.status).toBe(409);
        expect(response.body.error).toBe(
          `Can only cancel queued releases`
        );

        updateReleaseStatus({
          db,
          commitSha: randomCommitSha,
          status: "timeout",
          startedAt: new Date(),
        });
        response = await request(app).delete(`/queue/${randomCommitSha}`);
        expect(response.status).toBe(409);
        expect(response.body.error).toBe(
          `Can only cancel queued releases`
        );
      });

      it("should cancel a queued release", async () => {
        const response = await request(app).delete(`/queue/${randomCommitSha2}`);
        expect(response.status).toBe(200);
        expect(response.body.message).toBe(
          `Release for commit ${randomCommitSha2} removed from queue`
        );
        const release = searchReleaseLog(db, randomCommitSha2);
        expect(release).toBeUndefined();
      });
    });
  });

  describe("GET /release", () => {
    beforeAll(() => {
      db.exec("DELETE FROM release_log");
      vi.clearAllMocks();
    });

    it("should return empty object if a release is not found", async () => {
      const response = await request(app).get(`/release/${generateRandomGitHash()}`);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({});
    });

    it('should return 400 for invalid commit SHA', async () => {
      const response = await request(app).get(`/release/invalid`);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe(`Invalid commit SHA format`);
    });

    it("should return 404 if a commit SHA is not provided", async () => {
      const response = await request(app).get(`/release`);
      expect(response.status).toBe(404);
      expect(response.body.error).toBe(`Not found`);
    });

    it("should return a release", async () => {
      addToQueue(db, randomCommitSha);
      updateReleaseStatus({
        db,
        commitSha: randomCommitSha,
        status: "success",
        startedAt: new Date(),
        endedAt: new Date(),
      });
      const response = await request(app).get(`/release/${randomCommitSha}`);
      expect(response.status).toBe(200);
      expect(response.body.release_status).toBe("success");
      expect(response.body.started_at).toBeDefined();
      expect(response.body.ended_at).toBeDefined();
      expect(response.body.queued_at).toBeDefined();
      expect(response.body.git_commit_sha).toBe(randomCommitSha);
    });
  });

  describe("GET /metrics", () => {
    beforeAll(() => {
      db.exec("DELETE FROM release_log");
      vi.clearAllMocks();

      // Create a success release with current timestamps (within 1 day filter)
      addToQueue(db, randomCommitSha);
      updateReleaseStatus({
        db,
        commitSha: randomCommitSha,
        status: "success",
        startedAt: new Date(Date.now() - 120_000), // 2 minutes ago
        endedAt: new Date(Date.now() - 60_000), // 1 minute ago
      });
      db.exec(`
        UPDATE release_log 
        SET queued_at = datetime('now', '-2 hours')
        WHERE git_commit_sha = '${randomCommitSha}';
      `);
      const randomCommitSha4 = generateRandomGitHash();
      addToQueue(db, randomCommitSha4);
      updateReleaseStatus({
        db,
        commitSha: randomCommitSha4,
        status: "success",
        startedAt: new Date(Date.now() - 240_000), // 4 minutes ago
        endedAt: new Date(Date.now() - 120_000), // 2 minutes ago
      });
      db.exec(`
        UPDATE release_log 
        SET queued_at = datetime('now', '-2 hours')
        WHERE git_commit_sha = '${randomCommitSha4}';
      `);

      // Create a failed release with current timestamps (within 1 day filter)
      addToQueue(db, randomCommitSha2);
      updateReleaseStatus({
        db,
        commitSha: randomCommitSha2,
        status: "failed",
        startedAt: new Date(Date.now() - 360_000), // 6 minutes ago
        endedAt: new Date(Date.now() - 180_000), // 3 minutes ago
      });
      db.exec(`
        UPDATE release_log 
        SET queued_at = datetime('now', '-2 hours')
        WHERE git_commit_sha = '${randomCommitSha2}';
      `);

      // Create a timeout release with old timestamps (outside 1 day filter)
      addToQueue(db, randomCommitSha3);
      updateReleaseStatus({
        db,
        commitSha: randomCommitSha3,
        status: "timeout",
        startedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      });
      db.exec(`
        UPDATE release_log 
        SET queued_at = datetime('now', '-2 days')
        WHERE git_commit_sha = '${randomCommitSha3}';
      `);
    });

    it('should return 400 if days is not a number', async () => {
      const response = await request(app).get(`/metrics?days=invalid`);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe(`days parameter is required`);
    });

    it("should return metrics", async () => {
      const days = '1'
      const response = await request(app).get(`/metrics?days=${days}`);
      expect(response.status).toBe(200);
      expect(response.body.metrics).toBeDefined();
      expect(response.body.period).toBe(`${days} days`);
      expect(response.body.metrics).toEqual([
        { release_status: "failed", count: 1, avg_duration_minutes: expect.closeTo(3, 0.01) },
        { release_status: "success", count: 2, avg_duration_minutes: expect.closeTo(1.5, 0.01) },
      ]);
    });
  });

  describe("POST /cleanup", () => {
    let savedReleases: {commitSha: string, status: ReleaseState}[] = [];
    beforeAll(() => {
      db.exec("DELETE FROM release_log");
      vi.clearAllMocks();

      for (const time of ["-23 hours", "-2 days"] as const) {
        for (const status of ["success", "failed", "timeout", "queued"] as const) {
          const randomCommitSha = generateRandomGitHash();
          addToQueue(db, randomCommitSha);
          updateReleaseStatus({
            db,
            commitSha: randomCommitSha,
            status,
          });
          db.exec(`
            UPDATE release_log 
            SET queued_at = datetime('now', '${time}')
            WHERE git_commit_sha = '${randomCommitSha}';
          `);
          if (time === '-23 hours' || ["queued", "running"].includes(status)) {
            savedReleases.push({
              commitSha: randomCommitSha,
              status,
            });
          }
        }
      }

      const randomCommitSha = generateRandomGitHash();
      addToQueue(db, randomCommitSha);
      updateReleaseStatus({
        db,
        commitSha: randomCommitSha,
        status: "running",
      });
      db.exec(`
        UPDATE release_log 
        SET queued_at = datetime('now', '-23 hours')
        WHERE git_commit_sha = '${randomCommitSha}';
      `);
      savedReleases.push({
        commitSha: randomCommitSha,
        status: "running",
      });
    });

    it("should cleanup old releases", async () => {
      const days = '1'
      const response = await request(app).post("/cleanup").send({ days });
      expect(response.status).toBe(200);
      expect(response.body.message).toBe(`Cleanup completed for releases older than ${days} day(s)`);

      const releases = db.prepare(`
        SELECT *
        FROM release_log;
      `).all() as ReleaseLogItem[];

      for (const release of releases) {
        expect(savedReleases).toContainEqual({
          commitSha: release.git_commit_sha,
          status: release.release_status,
        });
      }
    });
  });

  describe("Release Lifecycle", () => {
    beforeEach(() => {
      db.exec("DELETE FROM release_log");
      vi.clearAllMocks();
    });

    it("should queue a release and execute it", async () => {
      filepathMock.mockReturnValue(
        path.join(__dirname, "./utils/passing-release.sh")
      );
      const randomCommitSha = generateRandomGitHash();
      const response = await request(app).post("/queue").send({
        commitSha: randomCommitSha,
      });
      expect(response.status).toBe(200);
      expect(response.body.message).toBe(
        `Release queued for commit ${randomCommitSha}`
      );
      expect(response.body.state).toBe("queued");
      vi.advanceTimersByTime(QUEUE_INTERVAL_MS);
      await awaitSpyResult(executeReleaseMock, 0);
      expect(executeReleaseMock).toHaveBeenCalledWith(randomCommitSha, db);
      expect(
        db
          .prepare(
            `
            SELECT git_commit_sha,release_status, queued_at, started_at, ended_at
            FROM release_log 
            WHERE git_commit_sha = ?;
          `
          )
          .get(randomCommitSha)
      ).toEqual({
        git_commit_sha: randomCommitSha,
        release_status: "success",
        queued_at: expect.any(String),
        started_at: expect.any(String),
        ended_at: expect.any(String),
      });
    });

    it("should queue and execute multiple releases", async () => {
      filepathMock.mockReturnValue(
        path.join(__dirname, "./utils/passing-release.sh")
      );
      const randomCommitSha = generateRandomGitHash();
      const response = await request(app).post("/queue").send({
        commitSha: randomCommitSha,
      });
      expect(response.status).toBe(200);
      expect(response.body.message).toBe(
        `Release queued for commit ${randomCommitSha}`
      );
      expect(response.body.state).toBe("queued");

      const randomCommitSha2 = generateRandomGitHash();
      const response2 = await request(app).post("/queue").send({
        commitSha: randomCommitSha2,
      });
      expect(response2.status).toBe(200);
      expect(response2.body.message).toBe(
        `Release queued for commit ${randomCommitSha2}`
      );
      expect(response2.body.state).toBe("queued");

      const response3 = await request(app).post("/queue").send({
        commitSha: randomCommitSha2,
      });
      expect(response3.status).toBe(202);
      expect(response3.body.message).toBe(
        `Release for commit ${randomCommitSha2} exists with status queued`
      );
      expect(response3.body.state).toBe("queued");

      vi.advanceTimersByTime(QUEUE_INTERVAL_MS);
      await awaitSpyResult(executeReleaseMock, 0);
      expect(executeReleaseMock).toHaveBeenCalledWith(randomCommitSha, db);
      expect(executeReleaseMock).toHaveBeenCalledTimes(1);
      const state = getReleaseState(db, randomCommitSha);
      expect(state).toBe("success");

      vi.advanceTimersByTime(QUEUE_INTERVAL_MS);
      await awaitSpyResult(executeReleaseMock, 1);
      expect(executeReleaseMock).toHaveBeenCalledWith(randomCommitSha2, db);
      expect(executeReleaseMock).toHaveBeenCalledTimes(2);
      const state2 = getReleaseState(db, randomCommitSha2);
      expect(state2).toBe("success");
    });

    it("should gracefully handle a failing release", async () => {
      filepathMock.mockReturnValue(
        path.join(__dirname, "./utils/failing-release.sh")
      );
      const randomCommitSha = generateRandomGitHash();
      const response = await request(app).post("/queue").send({
        commitSha: randomCommitSha,
      });
      expect(response.status).toBe(200);
      expect(response.body.message).toBe(
        `Release queued for commit ${randomCommitSha}`
      );
      expect(response.body.state).toBe("queued");

      vi.advanceTimersByTime(QUEUE_INTERVAL_MS);
      await awaitSpyResult(executeReleaseMock, 0);
      expect(executeReleaseMock).toHaveBeenCalledWith(randomCommitSha, db);
      expect(executeReleaseMock).toHaveBeenCalledTimes(1);
      const release = searchReleaseLog(db, randomCommitSha);
      expect(release?.release_status).toBe("failed");
      expect(release?.ended_at).toBeDefined();
      expect(release?.started_at).toBeDefined();
      expect(release?.queued_at).toBeDefined();
      expect(release?.git_commit_sha).toBe(randomCommitSha);
    });

    it(
      "should gracefully handle a slow release",
      { timeout: 10000 },
      async () => {
        filepathMock.mockReturnValue(
          path.join(__dirname, "./utils/slow-release.sh")
        );
        const randomCommitSha = generateRandomGitHash();
        const response = await request(app).post("/queue").send({
          commitSha: randomCommitSha,
        });
        expect(response.status).toBe(200);
        expect(response.body.message).toBe(
          `Release queued for commit ${randomCommitSha}`
        );
        expect(response.body.state).toBe("queued");

        // trigger release execution
        vi.advanceTimersByTime(QUEUE_INTERVAL_MS);
        // trigger release timeout
        vi.advanceTimersByTime(RELEASE_TIMEOUT_MS + GRACEFUL_SHUTDOWN_MS);
        await awaitSpyResult(executeReleaseMock, 0);
        expect(executeReleaseMock).toHaveBeenCalledWith(randomCommitSha, db);
        expect(executeReleaseMock).toHaveBeenCalledTimes(1);

        const release = searchReleaseLog(db, randomCommitSha);
        expect(release?.release_status).toBe("timeout");
        expect(release?.ended_at).toBeDefined();
        expect(release?.started_at).toBeDefined();
        expect(release?.queued_at).toBeDefined();
        expect(release?.git_commit_sha).toBe(randomCommitSha);
      }
    );
  });

  describe('Chaos tests', () => {
    it("should set running releases to failed on app restart", async () => {
      // TODO: Implement chaos test
    });

    it("should not execute releases that are cancelled or running", async () => {
      // TODO: Implement chaos test
    });

    describe('Test with disabled database', () => {
      beforeAll(() => {
        db.close();
      });

      describe('Routes', () => {
        it('should return 500 if database is disabled', async () => {
          const response = await request(app).get('/healthcheck');
        })
      });

      describe('Release execution', () => {
        it('should not execute releases if database is disabled', async () => {
          filepathMock.mockReturnValue(
            path.join(__dirname, "./utils/passing-release.sh")
          );
          const randomCommitSha = generateRandomGitHash();
          const response = await request(app).post("/queue").send({
            commitSha: randomCommitSha,
          });
        })
      })
    });
  })
});
