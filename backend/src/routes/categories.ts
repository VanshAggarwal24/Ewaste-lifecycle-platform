import { Router } from 'express';
import { prisma } from '../index';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const cats = await prisma.ewasteCategory.findMany({ orderBy: { name: 'asc' } });
    res.json(cats);
  } catch {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

export default router;
