import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/database/migrationRunner';
import { createRouter } from '../src/routes/router';

let testDb: Database.Database;

describe('API Routes', () => {
  let app: express.Application;

  beforeAll(() => {
    testDb = new Database(':memory:');
    // TODO: use the same init fn as main so fkey are enabled
    runMigrations(testDb);

    app = express();
    app.use(express.json());
    app.use('/', createRouter(testDb));
  });

  afterAll(() => {
    if (testDb) {
      testDb.close();
    }
  });

  describe('GET /healthcheck', () => {
    it('should return 200 OK', async () => {
      const response = await request(app).get('/healthcheck');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('OK');
      expect(response.body.isReleaseRunning).toBe(false);
      expect(response.body.queueLength).toBe(0);
      expect(response.body.isProcessingQueue).toBe(false);
    });
  });

  describe('POST /queue', () => {
    it('should fail if the commit SHA is invalid', async () => {
      const response = await request(app).post('/queue').send({
        commitSha: 'invalid',
      });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid commit SHA format');
    });

    // it('should fail if the repository is invalid', async () => {
    //   const response = await request(app).post('/queue').send({
    //     commitSha: '1234567890',
    //     repository: 'invalid',
    //   });
    //   expect(response.status).toBe(400);
    //   expect(response.body.error).toBe('Invalid repository format');
    // });

    it('should trigger a release immediately', async () => {
      // TODO: Implement queue release test
    });

    it('should queue releases', async () => {
      // TODO: Implement queue release test

      // TODO: ensure releases can't run at the same time
    });
  });

  describe('GET /queue', () => {
    it('should return queue status', async () => {
      // TODO: Implement queue status test
    });
  });

  describe('DELETE /queue/:commitSha', () => {
    it('should return 404 for non-existent commit', async () => {
      // TODO: Implement not found test
    });

    it('should return 400 if a commit SHA is not provided', async () => {
      // TODO: Implement missing commit SHA test
    });

    it('should return 409 if a release is already running', async () => {
      // TODO: Implement running release test
    });

    it('should cancel a queued release', async () => {
        // TODO: Implement cancel release test
    });
  });

  describe('GET /release', () => {
    it('should return 400 if a commit SHA is not provided', async () => {
      // TODO: Implement missing commit SHA test
    });

    it('should return 404 if a release is not found', async () => {
      // TODO: Implement not found test
    });

    it('should return release state', async () => {
      // TODO: Implement release state test
    });
  });

  describe('GET /metrics', () => {
    it('should return metrics', async () => {
      // TODO: Implement metrics test
    });
  });

  describe('POST /cleanup', () => {
    it('should cleanup old releases', async () => {
      // TODO: Implement cleanup test
    });
  });

  describe('Chaos Testing', () => {
    it('should set running releases to failed on app restart', async () => {
      // TODO: Implement chaos test
    });

    it('should execute queued releases on app restart', async () => {
      // TODO: Implement chaos test
    });

    it('should not execute releases that are cancelled or running', async () => {
      // TODO: Implement chaos test
    });

    it('should not throw if a release fails', async () => {
      // TODO: Implement chaos test
    });
  });
});
