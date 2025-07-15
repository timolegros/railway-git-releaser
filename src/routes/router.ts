import {Router} from 'express';
import {healthcheck} from './healthcheck';
import Database from 'better-sqlite3';
import {queueRelease} from './queueRelease';
import {getRelease} from './getRelease';
import {queueStatus} from './queueStatus';
import {metrics} from './metrics';
import {cleanup} from './cleanup';
import {cancelRelease} from './cancelRelease';

export function createRouter(db: Database.Database) {
  const router = Router();

  router.get('/healthcheck', healthcheck);

  // Queue
  router.post('/queue', queueRelease.bind(null, db));
  router.delete('/queue/:commitSha', cancelRelease.bind(null, db));
  router.get('/queue', queueStatus.bind(null, db));

  // Release
  router.get('/release', getRelease.bind(null, db));
  router.get('/metrics', metrics.bind(null, db));
  router.post('/cleanup', cleanup.bind(null, db));

  router.use('/*', (req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return router;
}