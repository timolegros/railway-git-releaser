import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  vi,
  beforeEach,
} from "vitest";
import * as getReleaseScriptFilePath from "../src/utils/getReleaseScriptFilePath";
import * as executeReleaseForCommit from "../src/utils/executeRelease";
import request from "supertest";
import express from "express";
import Database from "better-sqlite3";
import path from "path";
import { isReleaseRunning } from "../src/utils/executeRelease";
import { GRACEFUL_SHUTDOWN_MS, QUEUE_INTERVAL_MS, RELEASE_TIMEOUT_MS } from "../src/config";
import { initApp } from "../src/main";
import { generateRandomGitHash } from "./utils/utils";
import { getReleaseState, searchReleaseLog } from "../src/database/utils";

const filepathMock = vi.spyOn(
  getReleaseScriptFilePath,
  "getReleaseScriptFilePath"
);
const executeReleaseMock = vi.spyOn(
  executeReleaseForCommit,
  "executeReleaseForCommit"
);

const awaitSpyResult = async (spy, callIndex = 0) => {
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
const commitSha2 = "d105f9b6309a02d6271b377658693b6a3424835d";

describe("API Routes", () => {
  let app: express.Application;

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

  describe("POST /queue and release execution", () => {
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

    it("should queue a release and execute it", async () => {
      filepathMock.mockReturnValue(
        path.join(__dirname, "./utils/passing-release.sh")
      );
      const response = await request(app).post("/queue").send({
        commitSha,
      });
      expect(response.status).toBe(200);
      expect(response.body.message).toBe(
        `Release queued for commit ${commitSha}`
      );
      expect(response.body.state).toBe("queued");
      vi.advanceTimersByTime(QUEUE_INTERVAL_MS);
      await awaitSpyResult(executeReleaseMock, 0);
      expect(executeReleaseMock).toHaveBeenCalledWith(commitSha, db);
      expect(
        db
          .prepare(`
            SELECT git_commit_sha,release_status, queued_at, started_at, ended_at
            FROM release_log 
            WHERE git_commit_sha = ?;
          `)
          .get(commitSha)
      ).toEqual({
        git_commit_sha: commitSha,
        release_status: "success",
        queued_at: expect.any(String),
        started_at: expect.any(String),
        ended_at: expect.any(String),
      });
    });

    it("should fail to queue the same release more than once", async () => {
      const response = await request(app).post("/queue").send({
        commitSha,
      });
      expect(response.status).toBe(202);
      expect(response.body.message).toBe(
        `Release for commit ${commitSha} exists with status success`
      );
      expect(response.body.state).toBe("success");
    });

    it("should queue multiple releases", async () => {
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

    it('should gracefully handle a failing release', async () => {
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

    it('should gracefully handle a slow release', { timeout: 10000 }, async () => {
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
    });
  });

  describe("GET /queue", () => {
    it("should return queue status", async () => {
      // TODO: Implement queue status test
    });
  });

  describe("DELETE /queue/:commitSha", () => {
    it("should return 404 for non-existent commit", async () => {
      // TODO: Implement not found test
    });

    it("should return 400 if a commit SHA is not provided", async () => {
      // TODO: Implement missing commit SHA test
    });

    it("should return 409 if a release is already running", async () => {
      // TODO: Implement running release test
    });

    it("should cancel a queued release", async () => {
      // TODO: Implement cancel release test
    });
  });

  describe("GET /release", () => {
    it("should return 400 if a commit SHA is not provided", async () => {
      // TODO: Implement missing commit SHA test
    });

    it("should return 404 if a release is not found", async () => {
      // TODO: Implement not found test
    });

    it("should return release state", async () => {
      // TODO: Implement release state test
    });
  });

  describe("GET /metrics", () => {
    it("should return metrics", async () => {
      // TODO: Implement metrics test
    });
  });

  describe("POST /cleanup", () => {
    it("should cleanup old releases", async () => {
      // TODO: Implement cleanup test
    });
  });

  describe("Chaos Testing", () => {
    it("should set running releases to failed on app restart", async () => {
      // TODO: Implement chaos test
    });

    it("should execute queued releases on app restart", async () => {
      // TODO: Implement chaos test
    });

    it("should not execute releases that are cancelled or running", async () => {
      // TODO: Implement chaos test
    });

    it("should not throw if a release fails", async () => {
      // TODO: Implement chaos test
    });
  });
});
