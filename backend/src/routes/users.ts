import { Router } from 'express';
import { prisma } from '../index';
import { authenticateToken, AuthRequest, requireRole } from '../middlewares/auth';

const router = Router();

// Admin-only: list all users with roles
router.get('/', authenticateToken, requireRole(['ADMIN']), async (_req: AuthRequest, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        created_at: true,
        role: { select: { name: true } },
      },
      orderBy: { created_at: 'desc' },
    });
    res.json(users);
  } catch {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// List active recyclers (center staff batch creation)
router.get('/recyclers', authenticateToken, requireRole(['CENTER_STAFF', 'ADMIN']), async (_req: AuthRequest, res) => {
  try {
    const recyclers = await prisma.user.findMany({
      where: { active: true, role: { name: 'RECYCLER' } },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    });
    res.json(recyclers);
  } catch {
    res.status(500).json({ error: 'Failed to fetch recyclers' });
  }
});

export default router;
