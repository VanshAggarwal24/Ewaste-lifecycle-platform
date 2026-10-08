import { Router } from 'express';
import { prisma } from '../index';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const centers = await prisma.collectionCenter.findMany({
      where: { active: true },
      orderBy: { name: 'asc' }
    });
    res.json(centers);
  } catch {
    res.status(500).json({ error: 'Failed to fetch centers' });
  }
});

export default router;
