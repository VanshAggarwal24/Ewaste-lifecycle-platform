import { Router } from 'express';
import { prisma } from '../index';
import { authenticateToken, AuthRequest, requireRole } from '../middlewares/auth';

const router = Router();

router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    let whereClause = {};
    if (req.user.role === 'USER') whereClause = { user_id: req.user.userId };
    else if (req.user.role === 'COLLECTION_AGENT') whereClause = { agent_id: req.user.userId };
    // Centers see all pickups assigned to their center, etc.

    const pickups = await prisma.pickupRequest.findMany({
      where: whereClause,
      include: {
        user: { select: { name: true, phone: true } },
        center: true,
        items: true
      }
    });

    res.json(pickups);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pickups' });
  }
});

// Transactional endpoint for Collection Agent confirming pickup
router.post('/:id/confirm', authenticateToken, requireRole(['COLLECTION_AGENT']), async (req: AuthRequest, res): Promise<void> => {
  try {
    const pickupId = req.params.id;
    const { actual_weight_kg } = req.body;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Validate pickup status using lock (handled implicitly in optimistic/serializable or explicit lock)
      // Prisma doesn't have explicit FOR UPDATE in its standard query builder, but we can check state strictly
      const pickup = await tx.pickupRequest.findFirst({
        where: { id: pickupId, agent_id: req.user.userId, status: 'PICKUP_ASSIGNED' },
        include: { items: true, center: true }
      });

      if (!pickup) {
        throw new Error('Pickup not found or not in valid state');
      }

      // 2. Update PickupRequest to 'COLLECTED'
      const updatedPickup = await tx.pickupRequest.update({
        where: { id: pickupId },
        data: { status: 'COLLECTED', collected_at: new Date() }
      });

      // 3. Update EwasteItems status and actual weight
      const totalEstimated = pickup.items.reduce((sum, item) => sum + item.estimated_weight_kg, 0);
      const actualWeightToUse = actual_weight_kg || totalEstimated;

      for (const item of pickup.items) {
        await tx.ewasteItem.update({
          where: { id: item.id },
          data: { 
            status: 'COLLECTED', 
            actual_weight_kg: item.estimated_weight_kg * (actualWeightToUse / totalEstimated) // proportional 
          }
        });

        // 4. Insert StatusHistory
        await tx.statusHistory.create({
          data: {
            item_id: item.id,
            old_status: 'PICKUP_ASSIGNED',
            new_status: 'COLLECTED',
            changed_by: req.user.userId,
            remarks: 'Agent confirmed collection.'
          }
        });
      }

      // 5. Update agent current_load_kg (increases)
      await tx.collectionAgentProfile.update({
        where: { user_id: req.user.userId },
        data: {
          current_load_kg: { increment: actualWeightToUse }
        }
      });

      return updatedPickup;
    });

    res.json({ message: 'Pickup confirmed successfully', pickup: result });
  } catch (error: any) {
    console.error(error);
    res.status(409).json({ error: error.message || 'Transaction failed' });
  }
});

// Center receives pickup (drops load from agent, adds to center)
router.post('/:id/receive', authenticateToken, requireRole(['CENTER_STAFF']), async (req: AuthRequest, res): Promise<void> => {
  try {
    const pickupId = req.params.id;

    const result = await prisma.$transaction(async (tx) => {
      const pickup = await tx.pickupRequest.findFirst({
        where: { id: pickupId, status: 'COLLECTED' },
        include: { items: true }
      });

      if (!pickup) throw new Error('Pickup not found or not COLLECTED');

      const totalWeight = pickup.items.reduce((sum, item) => sum + (item.actual_weight_kg || item.estimated_weight_kg), 0);

      // Update pickup
      await tx.pickupRequest.update({
        where: { id: pickupId },
        data: { status: 'COMPLETED', completed_at: new Date() }
      });

      // Update items
      for (const item of pickup.items) {
        await tx.ewasteItem.update({
          where: { id: item.id },
          data: { status: 'RECEIVED_AT_CENTER' }
        });

        await tx.statusHistory.create({
          data: {
            item_id: item.id,
            old_status: 'COLLECTED',
            new_status: 'RECEIVED_AT_CENTER',
            changed_by: req.user.userId
          }
        });
      }

      // Decrease Agent load
      if (pickup.agent_id) {
        await tx.collectionAgentProfile.update({
          where: { user_id: pickup.agent_id },
          data: { current_load_kg: { decrement: totalWeight } }
        });
      }

      // Increase Center load
      await tx.collectionCenter.update({
        where: { id: pickup.center_id },
        data: { current_load_kg: { increment: totalWeight } }
      });

      return pickup;
    });

    res.json({ message: 'Received at center', pickup: result });
  } catch (error: any) {
    res.status(409).json({ error: error.message });
  }
});

export default router;
