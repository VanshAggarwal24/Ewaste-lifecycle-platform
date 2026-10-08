import { Router } from 'express';
import { prisma } from '../index';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const materials = await prisma.recoverableMaterial.findMany({ orderBy: { name: 'asc' } });
    res.json(materials);
  } catch {
    res.status(500).json({ error: 'Failed to fetch materials' });
  }
});

export default router;
