import { Router } from 'express';
import { prisma } from '../index';
import { authenticateToken, AuthRequest, requireRole } from '../middlewares/auth';

const router = Router();

// Create inspection
router.post('/', authenticateToken, requireRole(['CENTER_STAFF', 'ADMIN']), async (req: AuthRequest, res): Promise<void> => {
  try {
    const {
      item_id, physical_condition, functional_status,
      classification, estimated_recoverable_weight_kg,
      hazardous_components, notes
    } = req.body;

    const existing = await prisma.inspection.findUnique({ where: { item_id } });
    if (existing) {
      res.status(409).json({ error: 'Inspection already exists for this item.' });
      return;
    }

    const item = await prisma.ewasteItem.findUnique({ where: { id: item_id } });
    if (!item || item.status !== 'RECEIVED_AT_CENTER') {
      res.status(400).json({ error: 'Item not in RECEIVED_AT_CENTER status.' });
      return;
    }

    const inspection = await prisma.$transaction(async (tx) => {
      const insp = await tx.inspection.create({
        data: {
          item_id,
          inspector_id: req.user.userId,
          physical_condition,
          functional_status,
          classification,
          estimated_recoverable_weight_kg,
          hazardous_components,
          notes,
        }
      });

      await tx.ewasteItem.update({
        where: { id: item_id },
        data: { status: 'INSPECTED' }
      });

      await tx.statusHistory.create({
        data: {
          item_id,
          old_status: 'RECEIVED_AT_CENTER',
          new_status: 'INSPECTED',
          changed_by: req.user.userId,
          remarks: `Classification: ${classification}`,
        }
      });

      return insp;
    });

    res.status(201).json(inspection);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', authenticateToken, async (_req, res) => {
  try {
    const inspections = await prisma.inspection.findMany({
      include: { item: { include: { category: true } }, inspector: { select: { name: true } } },
      orderBy: { inspected_at: 'desc' }
    });
    res.json(inspections);
  } catch {
    res.status(500).json({ error: 'Failed to fetch inspections' });
  }
});

export default router;
