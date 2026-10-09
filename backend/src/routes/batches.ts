import { Router } from 'express';
import { prisma } from '../index';
import { authenticateToken, AuthRequest, requireRole } from '../middlewares/auth';

const router = Router();

router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    let where: Record<string, unknown> | undefined;
    if (req.user.role === 'RECYCLER') {
      where = { recycler_id: req.user.userId };
    } else if (req.user.role === 'CENTER_STAFF') {
      const profile = await prisma.centerStaffProfile.findUnique({ where: { user_id: req.user.userId } });
      if (profile) where = { center_id: profile.center_id };
    }

    const batches = await prisma.processingBatch.findMany({
      where,
      include: {
        center: { select: { name: true, address: true } },
        batch_items: true,
        material_recoveries: { include: { material: true } },
      },
      orderBy: { created_at: 'desc' }
    });
    res.json(batches);
  } catch {
    res.status(500).json({ error: 'Failed to fetch batches' });
  }
});

// Center staff creates a batch
router.post('/', authenticateToken, requireRole(['CENTER_STAFF', 'ADMIN']), async (req: AuthRequest, res): Promise<void> => {
  try {
    const { center_id: bodyCenterId, recycler_id, item_ids } = req.body;

    if (!Array.isArray(item_ids) || item_ids.length === 0) {
      res.status(400).json({ error: 'item_ids must be a non-empty array' });
      return;
    }

    let center_id = bodyCenterId as string | undefined;
    if (req.user.role === 'CENTER_STAFF') {
      const profile = await prisma.centerStaffProfile.findUnique({ where: { user_id: req.user.userId } });
      if (!profile) {
        res.status(403).json({ error: 'Center staff profile not found' });
        return;
      }
      if (center_id && center_id !== profile.center_id) {
        res.status(403).json({ error: 'Cannot create batches for another center' });
        return;
      }
      center_id = profile.center_id;
    } else if (!center_id) {
      res.status(400).json({ error: 'center_id is required' });
      return;
    }

    const recycler = await prisma.user.findFirst({
      where: { id: recycler_id, role: { name: 'RECYCLER' }, active: true },
    });
    if (!recycler) {
      res.status(400).json({ error: 'Invalid recycler' });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const batch = await tx.processingBatch.create({
        data: {
          center_id,
          recycler_id,
          status: 'PENDING',
          sent_at: new Date()
        }
      });

      let totalWeight = 0;

      for (const itemId of item_ids) {
        const item = await tx.ewasteItem.findUnique({
          where: { id: itemId },
          include: { pickup_request: true }
        });
        if (!item || item.status !== 'INSPECTED') throw new Error(`Item ${itemId} not valid for batching`);
        if (item.pickup_request?.center_id !== center_id) throw new Error(`Item ${itemId} does not belong to this center`);

        const weight = item.actual_weight_kg || item.estimated_weight_kg;
        totalWeight += weight;

        await tx.processingBatchItem.create({
          data: {
            batch_id: batch.id,
            item_id: item.id,
            processed_weight_kg: weight
          }
        });

        await tx.ewasteItem.update({
          where: { id: item.id },
          data: { status: 'PROCESSING' }
        });

        await tx.statusHistory.create({
          data: {
            item_id: item.id,
            old_status: 'INSPECTED',
            new_status: 'PROCESSING',
            changed_by: req.user.userId
          }
        });
      }

      // Decrease Center Load
      await tx.collectionCenter.update({
        where: { id: center_id },
        data: { current_load_kg: { decrement: totalWeight } }
      });

      return batch;
    });

    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Recycler completes batch and records material recoveries
router.post('/:id/complete', authenticateToken, requireRole(['RECYCLER', 'ADMIN']), async (req: AuthRequest, res): Promise<void> => {
  try {
    const batchId = req.params.id;
    if (typeof batchId !== 'string') {
      res.status(400).json({ error: 'Invalid batch ID' });
      return;
    }
    const { recoveries } = req.body; // Array of { material_id, quantity_kg }

    const result = await prisma.$transaction(async (tx) => {
      const batch = await tx.processingBatch.findUnique({
        where: { id: batchId },
        include: { batch_items: true }
      });

      if (!batch || batch.status === 'COMPLETED') {
        throw new Error('Batch not found or already completed');
      }
      if (req.user.role === 'RECYCLER' && batch.recycler_id !== req.user.userId) {
        throw new Error('Batch not assigned to you');
      }

      // 1. Mark batch completed
      const updatedBatch = await tx.processingBatch.update({
        where: { id: batchId },
        data: { status: 'COMPLETED', completed_at: new Date() }
      });

      // 2. Insert into material_recoveries
      for (const rec of recoveries) {
        await tx.materialRecovery.create({
          data: {
            batch_id: batchId,
            material_id: rec.material_id,
            quantity_kg: rec.quantity_kg
          }
        });
      }

      // 3. Cascade finish to items (Update EwasteItem -> RECYCLED)
      for (const bItem of batch.batch_items) {
        await tx.ewasteItem.update({
          where: { id: bItem.item_id },
          data: { status: 'RECYCLED' }
        });

        await tx.statusHistory.create({
          data: {
            item_id: bItem.item_id,
            old_status: 'PROCESSING',
            new_status: 'RECYCLED',
            changed_by: req.user.userId
          }
        });
      }

      return updatedBatch;
    });

    res.json({ message: 'Batch completed successfully', batch: result });
  } catch (error: any) {
    res.status(409).json({ error: error.message });
  }
});

export default router;
