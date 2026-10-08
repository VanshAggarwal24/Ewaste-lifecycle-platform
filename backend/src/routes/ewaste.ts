import { Router } from 'express';
import { prisma } from '../index';
import { authenticateToken, AuthRequest } from '../middlewares/auth';
import { assignPickup } from '../services/smartAssignment';

const router = Router();

router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { category_id, estimated_weight_kg, condition, center_id, pickup_latitude, pickup_longitude } = req.body;
    
    // Create e-waste item
    const ewaste = await prisma.ewasteItem.create({
      data: {
        user_id: req.user.userId,
        category_id,
        estimated_weight_kg,
        condition,
        status: 'SUBMITTED'
      }
    });

    // Create history
    await prisma.statusHistory.create({
      data: {
        item_id: ewaste.id,
        new_status: 'SUBMITTED',
        changed_by: req.user.userId
      }
    });

    // Auto-create pickup request for demonstration
    const pickup = await prisma.pickupRequest.create({
      data: {
        user_id: req.user.userId,
        center_id,
        status: 'PICKUP_REQUESTED',
        latitude: pickup_latitude,
        longitude: pickup_longitude,
        scheduled_at: new Date(Date.now() + 86400000) // tomorrow
      }
    });

    await prisma.ewasteItem.update({
      where: { id: ewaste.id },
      data: { 
        pickup_request_id: pickup.id,
        status: 'PICKUP_REQUESTED'
      }
    });

    await prisma.statusHistory.create({
      data: {
        item_id: ewaste.id,
        old_status: 'SUBMITTED',
        new_status: 'PICKUP_REQUESTED',
        changed_by: req.user.userId
      }
    });

    // Run smart assignment in background
    assignPickup(pickup.id, estimated_weight_kg).catch(console.error);

    res.status(201).json(ewaste);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create e-waste item' });
  }
});

router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const items = await prisma.ewasteItem.findMany({
      where: req.user.role === 'USER' ? { user_id: req.user.userId } : undefined,
      include: { category: true, pickup_request: true }
    });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

router.get('/:id', authenticateToken, async (req: AuthRequest, res): Promise<void> => {
  try {
    const item = await prisma.ewasteItem.findUnique({
      where: { id: req.params.id },
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

    // Role check if needed...
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});

export default router;
