import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
export const prisma = new PrismaClient({ adapter });

export const app = express();
app.use(cors());
app.use(express.json());

// Routes
import authRoutes       from './routes/auth';
import ewasteRoutes     from './routes/ewaste';
import pickupRoutes     from './routes/pickups';
import analyticsRoutes  from './routes/analytics';
import batchRoutes      from './routes/batches';
import categoryRoutes   from './routes/categories';
import centerRoutes     from './routes/centers';
import materialRoutes   from './routes/materials';
import inspectionRoutes from './routes/inspections';
import userRoutes       from './routes/users';

app.use('/api/auth',        authRoutes);
app.use('/api/ewaste',      ewasteRoutes);
app.use('/api/pickups',     pickupRoutes);
app.use('/api/analytics',   analyticsRoutes);
app.use('/api/batches',     batchRoutes);
app.use('/api/categories',  categoryRoutes);
app.use('/api/centers',     centerRoutes);
app.use('/api/materials',   materialRoutes);
app.use('/api/inspections', inspectionRoutes);
app.use('/api/users',       userRoutes);

// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 5000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}