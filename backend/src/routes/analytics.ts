import { Router } from 'express';
import { prisma } from '../index';
import { authenticateToken } from '../middlewares/auth';

const router = Router();

router.get('/kpis', authenticateToken, async (_req, res) => {
  try {
    const totalCollected = await prisma.ewasteItem.aggregate({
      where: { status: { in: ['COLLECTED', 'RECEIVED_AT_CENTER', 'INSPECTED', 'PROCESSING', 'RECYCLED', 'REFURBISHED', 'DISPOSED'] } },
      _sum: { actual_weight_kg: true, estimated_weight_kg: true }
    });
    const weightCollected = totalCollected._sum.actual_weight_kg ?? totalCollected._sum.estimated_weight_kg ?? 0;

    const recycledOutput = await prisma.materialRecovery.aggregate({ _sum: { quantity_kg: true } });

    const categoryDist = await prisma.$queryRaw`
      SELECT c.name, COUNT(i.id)::int as count
      FROM ewaste_categories c
      LEFT JOIN ewaste_items i ON c.id = i.category_id
      GROUP BY c.id, c.name
      ORDER BY count DESC
    ` as any[];

    const inputResult = await prisma.$queryRaw`
      SELECT COALESCE(SUM(pbi.processed_weight_kg), 0) as total_input
      FROM processing_batch_items pbi
      JOIN processing_batches pb ON pbi.batch_id = pb.id
      WHERE pb.status = 'COMPLETED'
    ` as any[];

    const inputWeight = Number(inputResult[0]?.total_input ?? 1);
    const recovered   = Number(recycledOutput._sum.quantity_kg ?? 0);
    const recoveryRate = inputWeight > 0 ? ((recovered / inputWeight) * 100).toFixed(1) + '%' : '0%';

    res.json({
      totalWeightCollected: Number(weightCollected),
      totalWeightRecycled: recovered,
      recoveryRate,
      categoryDistribution: categoryDist,
    });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch KPIs' });
  }
});

router.get('/charts', authenticateToken, async (_req, res) => {
  try {
    // Monthly collection trend
    const monthly = await prisma.$queryRaw`
      SELECT TO_CHAR(DATE_TRUNC('month', submitted_at), 'Mon YY') as month,
             COUNT(id)::int as items,
             COALESCE(SUM(estimated_weight_kg), 0)::float as weight_kg
      FROM ewaste_items
      GROUP BY DATE_TRUNC('month', submitted_at)
      ORDER BY DATE_TRUNC('month', submitted_at)
    ` as any[];

    // Outcome distribution
    const outcomes = await prisma.$queryRaw`
      SELECT status, COUNT(id)::int as count
      FROM ewaste_items
      WHERE status IN ('RECYCLED', 'REFURBISHED', 'DISPOSED', 'PROCESSING', 'SUBMITTED', 'COLLECTED')
      GROUP BY status
    ` as any[];

    // Material recovery distribution
    const materials = await prisma.$queryRaw`
      SELECT rm.name, COALESCE(SUM(mr.quantity_kg), 0)::float as total_kg
      FROM recoverable_materials rm
      LEFT JOIN material_recoveries mr ON rm.id = mr.material_id
      GROUP BY rm.id, rm.name
      ORDER BY total_kg DESC
    ` as any[];

    res.json({ monthly, outcomes, materials });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch charts' });
  }
});

export default router;
