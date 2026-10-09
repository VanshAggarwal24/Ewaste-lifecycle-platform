import { Router } from 'express';
import { prisma } from '../index';
import { authenticateToken, AuthRequest, requireRole } from '../middlewares/auth';

const router = Router();

async function getStaffCenterId(userId: string): Promise<string | null> {
  const profile = await prisma.centerStaffProfile.findUnique({ where: { user_id: userId } });
  return profile?.center_id ?? null;
}

router.get(
  '/',
  authenticateToken,
  requireRole(['USER', 'COLLECTION_AGENT', 'CENTER_STAFF', 'ADMIN']),
  async (req: AuthRequest, res) => {
  try {
    let whereClause: Record<string, unknown> = {};
    if (req.user.role === 'USER') whereClause = { user_id: req.user.userId };
    else if (req.user.role === 'COLLECTION_AGENT') whereClause = { agent_id: req.user.userId };
    else if (req.user.role === 'CENTER_STAFF') {
      const centerId = await getStaffCenterId(req.user.userId);
      if (!centerId) {
        res.status(403).json({ error: 'Center staff profile not found' });
        return;
      }
      whereClause = { center_id: centerId };
    }

    const pickups = await prisma.pickupRequest.findMany({
      where: whereClause,
      include: {
        user: { select: { name: true, phone: true } },
        agent: { select: { name: true } },
        center: true,
        items: true
      },
      orderBy: { created_at: 'desc' }
    });

    res.json(pickups);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pickups' });
  }
});

router.post(
  '/:id/assign',
  authenticateToken,
  requireRole(['ADMIN']),
  async (req: AuthRequest, res): Promise<void> => {
    const pickupId = req.params.id;
    const { agent_id: requestedAgentId } = req.body;
    if (typeof pickupId !== 'string') {
      res.status(400).json({ error: 'Invalid pickup ID' });
      return;
    }
    if (requestedAgentId !== null && typeof requestedAgentId !== 'string') {
      res.status(400).json({ error: 'agent_id must be a collection agent ID or null' });
      return;
    }

    try {
      const pickup = await prisma.$transaction(async (tx) => {
        const current = await tx.pickupRequest.findUnique({
          where: { id: pickupId },
          include: { items: true },
        });
        if (!current) throw new Error('Pickup not found');
        if (!['PICKUP_REQUESTED', 'PICKUP_ASSIGNED'].includes(current.status)) {
          throw new Error('Only uncollected pickups can be assigned or reassigned');
        }
        if (current.items.length === 0) throw new Error('Pickup has no e-waste items');

        const targetStatus = requestedAgentId ? 'PICKUP_ASSIGNED' : 'PICKUP_REQUESTED';
        if (requestedAgentId === current.agent_id && current.status === targetStatus) return current;

        if (requestedAgentId) {
          const agent = await tx.collectionAgentProfile.findFirst({
            where: {
              user_id: requestedAgentId,
              available_status: true,
              user: { active: true, role: { name: 'COLLECTION_AGENT' } },
            },
          });
          if (!agent) throw new Error('Selected collection agent is unavailable');

          const expectedWeight = current.items.reduce(
            (sum, item) => sum + (item.actual_weight_kg ?? item.estimated_weight_kg),
            0,
          );
          if (agent.current_load_kg + expectedWeight > agent.max_load_kg) {
            throw new Error('Selected collection agent does not have enough capacity');
          }
        }

        const updated = await tx.pickupRequest.updateMany({
          where: { id: pickupId, status: current.status, agent_id: current.agent_id },
          data: {
            agent_id: requestedAgentId,
            status: targetStatus,
            assigned_at: requestedAgentId ? new Date() : null,
          },
        });
        if (updated.count !== 1) throw new Error('Pickup changed concurrently; reload and try again');

        for (const item of current.items) {
          if (!['PICKUP_REQUESTED', 'PICKUP_ASSIGNED'].includes(item.status)) {
            throw new Error(`Item ${item.id} is not in an assignable state`);
          }
          await tx.ewasteItem.update({
            where: { id: item.id },
            data: { status: targetStatus },
          });
          await tx.statusHistory.create({
            data: {
              item_id: item.id,
              old_status: item.status,
              new_status: targetStatus,
              changed_by: req.user.userId,
              remarks: requestedAgentId ? 'Assigned by administrator' : 'Returned to unassigned queue',
            },
          });
        }

        return tx.pickupRequest.findUniqueOrThrow({ where: { id: pickupId } });
      });

      res.json({ message: pickup.agent_id ? 'Pickup assigned' : 'Pickup returned to unassigned queue', pickup });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to assign pickup';
      const status = message === 'Pickup not found' ? 404 : 409;
      res.status(status).json({ error: message });
    }
  },
);

// Transactional endpoint for Collection Agent confirming pickup
router.post('/:id/confirm', authenticateToken, requireRole(['COLLECTION_AGENT']), async (req: AuthRequest, res): Promise<void> => {
  try {
    const pickupId = req.params.id;
    if (typeof pickupId !== 'string') {
      res.status(400).json({ error: 'Invalid pickup ID' });
      return;
    }
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
    if (typeof pickupId !== 'string') {
      res.status(400).json({ error: 'Invalid pickup ID' });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const pickup = await tx.pickupRequest.findFirst({
        where: { id: pickupId, status: 'COLLECTED' },
        include: { items: true, center: true }
      });

      if (!pickup) throw new Error('Pickup not found or not COLLECTED');

      const totalWeight = pickup.items.reduce((sum, item) => sum + (item.actual_weight_kg || item.estimated_weight_kg), 0);

      if (req.user.role === 'CENTER_STAFF') {
        const centerId = await getStaffCenterId(req.user.userId);
        if (!centerId || pickup.center_id !== centerId) {
          throw new Error('Pickup does not belong to your collection center');
        }
      }

      // Update pickup — terminal state for the pickup request
      await tx.pickupRequest.update({
        where: { id: pickupId },
        data: { status: 'RECEIVED_AT_CENTER', completed_at: new Date() }
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
