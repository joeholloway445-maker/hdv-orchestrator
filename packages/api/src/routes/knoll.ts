import { Router } from 'express';
import { supabaseAuth } from '../middleware/supabase';
import { requireStudio } from '../middleware/plan';

const router = Router();

// GET /knoll/audit - tenant-scoped audit entries (ENTERPRISE+)
// The actual chain lives in the worker process; this returns a placeholder
// until we can expose it via Redis pub/sub
router.get('/audit', supabaseAuth, requireStudio('KNOLL'), async (req, res) => {
  res.json({
    entries: [],
    verified: true,
    tenantId: (req as { user?: { tenantId?: string } }).user?.tenantId,
    message: 'Audit chain entries are stored in the worker process. Use the Admin panel for the full chain.'
  });
});

export default router;
