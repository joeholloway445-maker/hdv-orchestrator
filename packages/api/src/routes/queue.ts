import { Router } from 'express';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const router = Router();

// Admin-only: x-admin-key header required
function adminAuth(req: any, res: any, next: any) {
  if (req.headers['x-admin-key'] !== process.env.ADMIN_SECRET_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

function makeConnection() {
  return new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
}

router.get('/stats', adminAuth, async (req, res) => {
  const connection = makeConnection();
  try {
    const queue = new Queue('workflow-execution', { connection });

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    await queue.close();
    await connection.quit();

    res.json({
      queue: 'workflow-execution',
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
      ts: new Date().toISOString(),
    });
  } catch (err: any) {
    try { await connection.quit(); } catch { /* ignore */ }
    res.status(503).json({ error: 'queue unavailable', detail: err.message });
  }
});

router.get('/jobs', adminAuth, async (req, res) => {
  const connection = makeConnection();
  try {
    const queue = new Queue('workflow-execution', { connection });

    const failedJobs = await queue.getFailed(0, 19);

    const failed = failedJobs.map((job) => ({
      id: job.id,
      name: job.name,
      data: job.data,
      failedReason: job.failedReason,
      stacktrace: job.stacktrace ?? [],
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      finishedOn: job.finishedOn,
    }));

    await queue.close();
    await connection.quit();

    res.json({ failed });
  } catch (err: any) {
    try { await connection.quit(); } catch { /* ignore */ }
    res.status(503).json({ error: 'queue unavailable', detail: err.message });
  }
});

export default router;
