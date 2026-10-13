# WebHookHub

**Reliable webhook delivery, without the guesswork.**

WebHookHub is a developer-first webhook delivery platform built to accept events, deliver them asynchronously to configured endpoints, retry failed requests, and make every attempt observable.

## Stack

- **Frontend:** React, JavaScript, Vite
- **API:** Node.js, Express
- **Database:** PostgreSQL, Prisma ORM
- **Planned delivery engine:** Redis-backed queue and workers
- **Security direction:** HMAC-SHA256 signatures, endpoint validation, scoped authentication

## Day 1 status

- [x] Monorepo workspace and local development scripts
- [x] Responsive dark developer dashboard starter
- [x] Express API with `GET /api` and `GET /api/health`
- [x] Prisma schema for users, endpoints, events, deliveries, and delivery attempts
- [x] Environment template and Git ignore rules
- [ ] Install dependencies and run a local build
- [ ] Configure PostgreSQL and apply the schema
- [ ] Replace dashboard demo data with real API data

Dashboard metric and delivery rows are currently **illustrative demo data**. They are not live delivery metrics yet.

## Prerequisites

- Node.js 20 or newer
- npm 10 or newer
- PostgreSQL 14 or newer (for database-backed health checks)

## Run locally

1. Install dependencies from the repository root:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and set `DATABASE_URL` to your local PostgreSQL database.

3. Generate the Prisma client and apply the schema:

   ```bash
   npm run db:generate
   npm run db:push
   ```

4. Start the client and API together:

   ```bash
   npm run dev
   ```

5. Open the dashboard at [http://localhost:5173](http://localhost:5173). API routes are served at [http://localhost:4000/api](http://localhost:4000/api).

The API health endpoint is [http://localhost:4000/api/health](http://localhost:4000/api/health). It returns a degraded status until PostgreSQL is configured and reachable.

## API starter

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api` | API identity and route discovery |
| GET | `/api/health` | API and database health |

## Product roadmap

1. Workspace setup and dashboard foundation
2. Authentication and endpoint management
3. Event ingestion and validation
4. Redis queue and asynchronous delivery worker
5. HMAC signing, retries with exponential backoff and jitter
6. Delivery history, replay, and observability
7. Tests, security hardening, deployment, and documentation

## Security notes

Never commit real credentials or endpoint secrets. The schema's endpoint secret is a starter field; production storage should encrypt secrets at rest and only reveal them at creation time. Before sending requests to customer URLs, implement SSRF protections (block loopback, private, link-local, and metadata IP ranges; validate redirects and DNS resolution).

## License

Not licensed for redistribution yet.
