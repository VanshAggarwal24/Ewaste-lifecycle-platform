# E-Waste Lifecycle — Collection, Recycling & Recovery Platform

## 1. Project Overview
This project is a real-world database-driven platform for managing the complete lifecycle of electronic waste. It traces e-waste from user submission through pickup, collection center inspection, and final recycling processing.

The project is designed with a strong emphasis on **Database Management System (DBMS)** concepts, ensuring strict relational data integrity, concurrency controls, and complex analytical aggregations via SQL.

## 2. Features
- **Role-Based Workflows**: USER, COLLECTION_AGENT, CENTER_STAFF, RECYCLER, ADMIN.
- **Strict Normalization**: Ensures 3NF across 16 tables, eliminating redundancy.
- **ACID Transactions**: Atomic state transitions (e.g., Pickup Confirmations safely transfer loads between agents and centers).
- **Smart Assignment**: Backend algorithms to intelligently dispatch pickups based on Agent Haversine distance and current capacity workload.
- **SQL Analytics**: Dashboards dynamically computed via aggregations and joins (no faked or statically hardcoded stats).

## 3. Technology Stack
- **Frontend**: React, TypeScript, Vite, Tailwind CSS, Recharts
- **Backend**: Node.js, Express, TypeScript, REST APIs
- **Database**: PostgreSQL (via Prisma ORM)
- **Authentication**: JWT, bcrypt

## 4. Setup Instructions
### Prerequisites
- Node.js (v18+)
- PostgreSQL (running locally or via Docker)

### Backend Setup
1. `cd backend`
2. `npm install`
3. Configure `.env`: `DATABASE_URL="postgresql://user:pass@localhost:5432/ewaste_db?schema=public"`
4. Run Migrations: `npx prisma migrate dev --name init`
5. Seed Database: `npx ts-node prisma/seed.ts`
6. Start API: `npx ts-node src/index.ts`

### Frontend Setup
1. `cd frontend`
2. `npm install`
3. `npm run dev`

## 5. Transaction Workflows & Concurrency
The application prevents concurrency issues like double-assigned pickups via implicit database locks and atomic transaction wrappers. When a pickup is marked "COLLECTED", a transaction safely transfers the total weight from the `collection_agent_profiles.current_load_kg` directly to `collection_centers.current_load_kg`.

## 6. Novel Aspect
**E-Waste Lifecycle Traceability + Smart Collection Assignment**
Unlike standard CRUD, this application tracks a state machine (the Item Lifecycle) from Submission to Recycled, while smartly dispatching logistics (Smart Assignment algorithm).
