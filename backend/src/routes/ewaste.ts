import { Router } from 'express';
import { prisma } from '../index';
import { authenticateToken, AuthRequest, requireRole } from '../middlewares/auth';
import { assignPickup } from '../services/smartAssignment';

const router = Router();

router.post('/', authenticateToken, requireRole(['USER']), async (req: AuthRequest, res) => {
  try {
    const { category_id, estimated_weight_kg, condition, center_id, pickup_latitude, pickup_longitude } = req.body;
    if (
      !Number.isInteger(category_id) ||
      typeof estimated_weight_kg !== 'number' ||
      !Number.isFinite(estimated_weight_kg) ||
      estimated_weight_kg <= 0 ||
      typeof center_id !== 'string' ||
      !center_id
    ) {
      res.status(400).json({ error: 'A valid category, positive estimated weight, and collection center are required' });
      return;
    }
    const validCoordinate = (value: unknown, limit: number) =>
      value === undefined ||
      value === null ||
      (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit);
    if (!validCoordinate(pickup_latitude, 90) || !validCoordinate(pickup_longitude, 180)) {
      res.status(400).json({ error: 'Pickup coordinates must be valid latitude and longitude values' });
      return;
    }

    const center = await prisma.collectionCenter.findFirst({ where: { id: center_id, active: true } });
    if (!center) {
      res.status(400).json({ error: 'Collection center not found or inactive' });
      return;
    }

    const created = await prisma.$transaction(async (tx) => {
      const item = await tx.ewasteItem.create({
        data: {
          user_id: req.user.userId,
          category_id,
          estimated_weight_kg,
          condition,
          status: 'SUBMITTED',
        },
      });
      const pickup = await tx.pickupRequest.create({
        data: {
          user_id: req.user.userId,
          center_id,
          status: 'PICKUP_REQUESTED',
          latitude: pickup_latitude ?? null,
          longitude: pickup_longitude ?? null,
          scheduled_at: new Date(Date.now() + 86400000),
        },
      });
      await tx.ewasteItem.update({
        where: { id: item.id },
        data: { pickup_request_id: pickup.id, status: 'PICKUP_REQUESTED' },
      });
      await tx.statusHistory.createMany({
        data: [
          { item_id: item.id, new_status: 'SUBMITTED', changed_by: req.user.userId },
          {
            item_id: item.id,
            old_status: 'SUBMITTED',
            new_status: 'PICKUP_REQUESTED',
            changed_by: req.user.userId,
          },
        ],
      });
      return { itemId: item.id, pickupId: pickup.id };
    });

    try {
      const assignedAgentId = await assignPickup(created.pickupId, estimated_weight_kg);
      if (!assignedAgentId) {
        console.warn(`Pickup ${created.pickupId} remains unassigned and requires administrator action`);
      }
    } catch (error) {
      console.error(`Automatic assignment failed for pickup ${created.pickupId}:`, error);
    }

    const item = await prisma.ewasteItem.findUniqueOrThrow({
      where: { id: created.itemId },
      include: { category: true, pickup_request: true },
    });
    res.status(201).json(item);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create e-waste item' });
  }
});

router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    let where: Record<string, unknown> | undefined;
    if (req.user.role === 'USER') {
      where = { user_id: req.user.userId };
    } else if (req.user.role === 'CENTER_STAFF') {
      const profile = await prisma.centerStaffProfile.findUnique({ where: { user_id: req.user.userId } });
      if (profile) {
        where = { pickup_request: { center_id: profile.center_id } };
      }
    }

    const items = await prisma.ewasteItem.findMany({
      where,
      include: { category: true, pickup_request: true, inspection: true }
    });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

router.get('/:id', authenticateToken, async (req: AuthRequest, res): Promise<void> => {
  try {
    const itemId = req.params.id;
    if (typeof itemId !== 'string') {
      res.status(400).json({ error: 'Invalid item ID' });
      return;
    }

    const item = await prisma.ewasteItem.findUnique({
      where: { id: itemId },
      include: {
        category: true,
        pickup_request: true,
        status_histories: {
          orderBy: { created_at: 'desc' },
          include: { user: { select: { name: true, role: true } } }
        },
        inspection: true
      }
    });

    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    if (req.user.role === 'USER' && item.user_id !== req.user.userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    if (req.user.role === 'CENTER_STAFF') {
      const profile = await prisma.centerStaffProfile.findUnique({ where: { user_id: req.user.userId } });
      if (!profile || item.pickup_request?.center_id !== profile.center_id) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
    }

    res.json(item);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});

export default router;
