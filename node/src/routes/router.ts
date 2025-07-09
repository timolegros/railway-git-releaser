import {Router} from 'express';
import {healthcheck} from './healthcheck';
import Database from 'better-sqlite3';
import {queueRelease} from './queueRelease';
import {releaseState} from './releaseState';
import {queueStatus} from './queueStatus';
import {metrics} from './metrics';
import {cleanup} from './cleanup';
import {cancelRelease} from './cancelRelease';

export function createRouter(db: Database.Database) {
  const router = Router();

  router.get('/healthcheck', healthcheck.bind(null, db));

  // Queue
  router.post('/queue', queueRelease.bind(null, db));
  router.delete('/queue/:commitSha', cancelRelease.bind(null, db));
  router.get('/queue', queueStatus.bind(null, db));

  // Release
  router.get('/release', releaseState.bind(null, db));
  router.get('/metrics', metrics.bind(null, db));
  router.post('/cleanup', cleanup.bind(null, db));

  return router;
}