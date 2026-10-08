import { prisma } from '../index';

// Calculate distance between two coordinates in km using Haversine formula
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export async function assignPickup(pickupId: string, itemWeight: number) {
  const pickup = await prisma.pickupRequest.findUnique({
    where: { id: pickupId },
    include: { center: true }
  });

  if (!pickup) throw new Error('Pickup not found');
  if (!pickup.latitude || !pickup.longitude) throw new Error('Pickup location missing');

  // Get available agents
  const agents = await prisma.collectionAgentProfile.findMany({
    where: { available_status: true },
    include: { user: true }
  });

  if (agents.length === 0) return null;

  let bestAgent = null;
  let bestScore = Infinity;

  const MAX_EXPECTED_DISTANCE_KM = 50; // Assume max distance is 50km for score normalization

  for (const agent of agents) {
    if (!agent.user.latitude || !agent.user.longitude) continue;

    const distance = getDistance(
      pickup.latitude, pickup.longitude, 
      agent.user.latitude, agent.user.longitude
    );

    // Normalize distance to 0-100 score (0 = best, 100 = worst)
    let distanceScore = (distance / MAX_EXPECTED_DISTANCE_KM) * 100;
    if (distanceScore > 100) distanceScore = 100;

    // Workload score (0 = free, 100 = overloaded)
    let workloadScore = (agent.current_load_kg / agent.max_load_kg) * 100;
    if (workloadScore > 100) workloadScore = 100;

    // Final score calculation
    const finalScore = (0.6 * distanceScore) + (0.4 * workloadScore);

    // Ensure they can handle the weight
    if (agent.current_load_kg + itemWeight <= agent.max_load_kg) {
      if (finalScore < bestScore) {
        bestScore = finalScore;
        bestAgent = agent;
      }
    }
  }

  if (bestAgent) {
    // Assign to best agent transactionally
    await prisma.pickupRequest.update({
      where: { id: pickupId },
      data: {
        agent_id: bestAgent.user_id,
        status: 'PICKUP_ASSIGNED',
        assigned_at: new Date()
      }
    });
    
    // Update ewaste item statuses
    await prisma.ewasteItem.updateMany({
      where: { pickup_request_id: pickupId },
      data: { status: 'PICKUP_ASSIGNED' }
    });
    
    return bestAgent.user_id;
  }
  
  return null;
}
