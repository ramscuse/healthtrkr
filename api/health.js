import { Router } from 'express';
import { timingSafeEqual } from 'crypto';
import prisma from '../lib/prisma.js';
import { authMiddleware } from '../server/middleware/auth.js';

const router = Router();

// POST /api/health/sync — uses shared sync token instead of JWT
router.post('/sync', async (req, res, next) => {
  try {
    const syncToken = req.headers['x-sync-token'];
    const userId = req.headers['x-user-id'];

    // Timing-safe token comparison
    const expected = process.env.HEALTH_SYNC_TOKEN;
    if (
      !syncToken ||
      !expected ||
      syncToken.length !== expected.length ||
      !timingSafeEqual(Buffer.from(syncToken), Buffer.from(expected))
    ) {
      return res.status(401).json({ error: 'Invalid sync token' });
    }

    if (!userId) {
      return res.status(400).json({ error: 'x-user-id header is required' });
    }

    // Verify the userId corresponds to a real user
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { data } = req.body;
    if (!data?.metrics || !Array.isArray(data.metrics)) {
      return res.status(400).json({ error: 'Invalid payload format' });
    }

    // Collect values by date
    const byDate = {};

    for (const metric of data.metrics) {
      const entries = metric.data || [];
      for (const entry of entries) {
        const dateStr = entry.date.split(' ')[0]; // "2026-03-10"
        if (!byDate[dateStr]) byDate[dateStr] = {};

        switch (metric.name) {
          case 'active_energy':
            byDate[dateStr].activeCalories = entry.qty;
            break;
          case 'basal_energy_burned':
            byDate[dateStr].restingCalories = entry.qty;
            break;
          case 'step_count':
            byDate[dateStr].steps = Math.round(entry.qty);
            break;
          case 'heart_rate':
            byDate[dateStr].heartRateAvg = Math.round(entry.avg ?? entry.qty ?? 0);
            break;
        }
      }
    }

    const upserts = Object.entries(byDate).map(([dateStr, values]) => {
      const date = new Date(dateStr);
      date.setUTCHours(0, 0, 0, 0);
      return prisma.healthData.upsert({
        where: { userId_date: { userId, date } },
        update: values,
        create: { userId, date, ...values },
      });
    });

    await Promise.all(upserts);
    res.json({ synced: upserts.length });
  } catch (err) {
    next(err);
  }
});

// PUT /api/health/active-calories — manually set active calories for a date
router.put('/active-calories', authMiddleware, async (req, res, next) => {
  try {
    const { userId } = req.user
    const { date, calories } = req.body

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date (YYYY-MM-DD) is required' })
    }
    if (typeof calories !== 'number' || !isFinite(calories) || calories < 0) {
      return res.status(400).json({ error: 'calories must be a non-negative number' })
    }

    const d = new Date(date)
    d.setUTCHours(0, 0, 0, 0)

    const record = await prisma.healthData.upsert({
      where: { userId_date: { userId, date: d } },
      update: { activeCalories: calories, source: 'manual' },
      create: { userId, date: d, activeCalories: calories, source: 'manual' },
    })

    res.json(record)
  } catch (err) {
    next(err)
  }
})

// GET /api/health/today — protected
router.get('/today', authMiddleware, async (req, res, next) => {
  try {
    const { userId } = req.user;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const record = await prisma.healthData.findUnique({
      where: { userId_date: { userId, date: today } },
    });

    res.json(record ?? null);
  } catch (err) {
    next(err);
  }
});

// GET /api/health/week — protected
router.get('/week', authMiddleware, async (req, res, next) => {
  try {
    const { userId } = req.user;
    const end = new Date();
    end.setUTCHours(23, 59, 59, 999);
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - 6);
    start.setUTCHours(0, 0, 0, 0);

    const records = await prisma.healthData.findMany({
      where: { userId, date: { gte: start, lte: end } },
      orderBy: { date: 'asc' },
    });

    res.json(records);
  } catch (err) {
    next(err);
  }
});

export default router;
