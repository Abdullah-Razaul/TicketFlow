# TicketFlow — Event Ticket Booking System

TicketFlow is a full-stack educational MVP for the CPS Academy InterviewQuest-3 project. It uses React/Vite, Express, Prisma and PostgreSQL (Neon-compatible). The app supports Organizer and Customer roles, event creation and discovery, generated seat maps, temporary holds, booking lifecycle/history, mock payment adapters, pricing strategies, cancellation/refund rules and in-app notifications.

> **Important:** Payments are simulated. This is an educational MVP, not a production ticketing/payment service. Do not use real customer or payment data. Understand and verify the code before submission.

## 1. Requirements
- Node.js 22 LTS recommended (Node 20.19+ also supported by this toolchain)
- npm
- A PostgreSQL database. Easiest hosted option: [Neon](https://neon.com/) free tier (limits apply). No XAMPP or Docker needed.

## 2. Create a Neon database
1. Create a Neon account and a project.
2. Open the project dashboard and copy the PostgreSQL connection string (use the pooled connection string for hosted runtime if provided).
3. Keep the connection string private. It contains your database password.

## 3. Run locally on Windows
Open the extracted `TicketFlow` folder in VS Code. Use two terminals.

### Backend
```powershell
cd backend
Copy-Item .env.example .env
```
Edit `backend/.env` and set:
```env
PORT=4000
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DB?sslmode=require"
JWT_SECRET="use-a-random-secret-with-at-least-32-characters"
JWT_EXPIRES_IN=1d
HOLD_MINUTES=5
CLIENT_ORIGIN=http://localhost:5173
```
Then run:
```powershell
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```
API health check: http://localhost:4000/api/health

### Frontend (second terminal)
```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```
Open http://localhost:5173

## 4. Demo accounts
After `npm run db:seed` in backend:
- Organizer: `organizer@ticketflow.demo` / `TicketFlowDemo123!`
- Customer: `customer@ticketflow.demo` / `TicketFlowDemo123!`

Change demo passwords before any public deployment. Seed is idempotent and does not reset an existing account's password.

## 5. Demo flow
1. Sign in as Organizer and create an event with a future date, rows, seats per row, and ticket price.
2. Sign out and sign in as Customer.
3. Browse the event and choose available seats.
4. Hold seats and complete a simulated payment. The hold duration is controlled by `HOLD_MINUTES` (default 5).
5. Open My bookings to view status/history and cancel a booking. Refund is simulated: full amount only when cancellation is more than 24 hours before the event; otherwise zero.
6. API supports both `card` and `wallet` mock providers.

## 6. Useful API endpoints
- `GET /api/health`
- `POST /api/auth/register`, `POST /api/auth/login`
- `GET /api/events?q=&city=&date=&page=&limit=`
- `GET /api/events/:id`, `GET /api/events/:id/seats`
- `POST /api/events`, `PUT /api/events/:id`, `DELETE /api/events/:id` (Organizer)
- `POST /api/bookings/hold`, `POST /api/bookings/:id/pay`
- `GET /api/bookings/mine`, `POST /api/bookings/:id/cancel`
- `GET /api/notifications`, `PATCH /api/notifications/:id/read`

All protected endpoints require `Authorization: Bearer <token>`.

## 7. Tests and quality checks
From `backend`: `npm test`, `npm run coverage`, `npm run lint`.
From `frontend`: `npm run lint`, `npm run build`.
GitHub Actions runs backend tests/coverage and frontend lint/build on push and pull request.

## 8. Deployment outline (free tiers have limits and may sleep)
### Database — Neon
Create a PostgreSQL database and use its connection string as backend `DATABASE_URL`.
### Backend — Render
Create a Web Service from the GitHub repository; Root Directory `backend`; Build Command `npm install && npx prisma generate`; Start Command `npx prisma db push && npm start`. Add `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `HOLD_MINUTES`, and `CLIENT_ORIGIN` environment variables. `CLIENT_ORIGIN` must be your deployed Vercel URL.
### Frontend — Vercel
Import the same GitHub repository; Root Directory `frontend`; Build Command `npm run build`; Output Directory `dist`. Set `VITE_API_URL=https://YOUR-RENDER-SERVICE.onrender.com/api`.
After deploying frontend, update Render `CLIENT_ORIGIN` to the exact Vercel URL and redeploy backend. Verify `/api/health` and the complete booking flow. Free provider limits and availability can change; confirm current plan limits in each dashboard.

## 9. Architecture and patterns
See [ARCHITECTURE.md](./ARCHITECTURE.md).

## 10. AI disclosure
See [AI_USAGE.md](./AI_USAGE.md). Update it truthfully with the tools you used and the changes you personally made.

## Security and known MVP limitations
- Mock payment providers only; no real charge or real refund occurs.
- Registration currently allows selecting a role for demo convenience. For a real public system, Organizer role assignment must be invitation/admin-controlled.
- Holds are released by a backend worker and lazily when event seats are read; the backend must stay running for prompt expiry.
- Serializable transaction isolation plus conditional seat updates reduce race risk; validate with a real concurrent load test before claiming production-grade guarantees.
- Add email provider, rate limiting, audit monitoring, stronger authorization review, and production observability before real-world use.
