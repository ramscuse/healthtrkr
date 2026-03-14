import { Router } from 'express';
import prisma from '../lib/prisma.js';

const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(dateStr) {
  if (!DATE_RE.test(dateStr)) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

// GET /api/water?date=YYYY-MM-DD  — entries for a day
router.get('/', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date is required' });
    const parsed = parseDate(date);
    if (!parsed) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });

    const start = new Date(parsed); start.setUTCHours(0, 0, 0, 0);
    const end   = new Date(parsed); end.setUTCHours(23, 59, 59, 999);

    const entries = await prisma.waterEntry.findMany({
      where: { userId, date: { gte: start, lte: end } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(entries);
  } catch (err) { next(err); }
});

// GET /api/water/today  — today's total oz
router.get('/today', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const now = new Date();
    const start = new Date(now); start.setUTCHours(0, 0, 0, 0);
    const end   = new Date(now); end.setUTCHours(23, 59, 59, 999);

    const entries = await prisma.waterEntry.findMany({
      where: { userId, date: { gte: start, lte: end } },
    });
    const total = entries.reduce((sum, e) => sum + e.amount, 0);
    res.json({ total, entries });
  } catch (err) { next(err); }
});

// POST /api/water  — log an entry
router.post('/', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { date, amount } = req.body;

    if (!date) return res.status(400).json({ error: 'date is required' });
    const parsed = parseDate(date);
    if (!parsed) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }

    const entry = await prisma.waterEntry.create({
      data: { userId, date: parsed, amount },
    });
    res.status(201).json(entry);
  } catch (err) { next(err); }
});

// DELETE /api/water/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const entry = await prisma.waterEntry.findUnique({ where: { id: req.params.id } });
    if (!entry) return res.status(404).json({ error: 'Not found' });
    if (entry.userId !== userId) return res.status(403).json({ error: 'Not authorized' });
    await prisma.waterEntry.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
