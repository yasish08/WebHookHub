# WebHookHub

**Reliable webhook delivery, without the guesswork.**

WebHookHub is a developer-first webhook delivery platform built to accept events, deliver them asynchronously to configured endpoints, retry failed requests, and make every attempt observable.

## Stack

- **Frontend:** React, JavaScript, Vite
- **API:** Node.js, Express
- **Database:** PostgreSQL, Prisma ORM
- **Planned delivery engine:** Redis-backed queue and workers
- **Security direction:** HMAC-SHA256 signatures, endpoint validation, scoped authentication

## Build status

### Day 1 — Foundation
- [x] Monorepo workspace and local development scripts
- [x] Responsive dark developer dashboard starter
- [x] Express API health and discovery routes
- [x] Prisma schema for users, endpoints, events, deliveries, and delivery attempts
- [x] Environment template and Git ignore rules

### Day 2 — Event ingestion
- [x] Add `POST /api/events` to validate and persist events
- [x] Validate event types, object payloads, and idempotency key length
- [x] Support the `Idempotency-Key` header and avoid duplicate event records
- [x] Add built-in Node.js tests for event input validation
- [x] Wire the dashboard's **Send test event** button to the real API route
- [ ] Install dependencies and run a local build/test pass
- [ ] Configure PostgreSQL and apply the schema
- [ ] Add endpoint management and queued delivery workers

Dashboard metric cards, activity chart, endpoint health rows, and recent-delivery table are still **illustrative demo data**. The test-event button now submits a real event to the API; a successful response means the event was stored as accepted, not that it has been delivered to a customer endpoint yet.

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

### Send a test event

With the API running and PostgreSQL configured, submit an event:

```bash
curl -X POST http://localhost:4000/api/events \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: demo-payment-001" \
  -d '{"eventType":"payment.succeeded","payload":{"orderId":"ord_123","amount":499}}'
```

A new event returns `202 Accepted`. Reusing the same idempotency key returns the previously stored event with `200 OK`. Event ingestion does **not** dispatch webhooks yet; queueing and delivery workers are planned next.

Run the current input-validation tests with:

```bash
npm test
```

These tests use Node's built-in test runner and do not require a running PostgreSQL database.

## API starter

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api` | API identity and route discovery |
| GET | `/api/health` | API and database health |
| POST | `/api/events` | Validate and persist an event (requires PostgreSQL) |

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
