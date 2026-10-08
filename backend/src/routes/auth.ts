import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../index';

const router = Router();

router.post('/register', async (req, res): Promise<void> => {
  try {
    const { email, password, name, roleName, phone, latitude, longitude } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(400).json({ error: 'Email already exists' });
      return;
    }

    const role = await prisma.role.findUnique({ where: { name: roleName || 'USER' } });
    if (!role) {
      res.status(400).json({ error: 'Invalid role' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        password_hash: hashedPassword,
        name,
        role_id: role.id,
        phone,
        latitude,
        longitude
      }
    });

    if (role.name === 'COLLECTION_AGENT') {
      await prisma.collectionAgentProfile.create({
        data: { user_id: user.id, max_load_kg: 500 }
      });
    }

    res.status(201).json({ message: 'User registered successfully', userId: user.id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async (req, res): Promise<void> => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ 
      where: { email },
      include: { role: true }
    });

    if (!user) {
      res.status(400).json({ error: 'Invalid credentials' });
      return;
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      res.status(400).json({ error: 'Invalid credentials' });
      return;
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role.name, email: user.email, name: user.name },
      process.env.JWT_SECRET as string,
      { expiresIn: '24h' }
    );

    res.json({ token, role: user.role.name, name: user.name, userId: user.id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
