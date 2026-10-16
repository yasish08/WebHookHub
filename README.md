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

### Day 3 — Authentication and endpoint API
- [x] Register users with bcrypt password hashing and JWT access tokens
- [x] Add login and authenticated `GET /api/auth/me`
- [x] Add owner-scoped endpoint list, create, update, delete, and secret rotation routes
- [x] Encrypt endpoint signing secrets at rest with AES-256-GCM
- [x] Validate endpoint URL schemes, credentials, ports, local/private IPs, and DNS results
- [x] Add unit tests for endpoint URL validation and secret encryption
- [ ] Confirm the GitHub Actions test and frontend-build results (workflow is configured on pushes to `main`)
- [x] Connect the premium endpoint management screen to login/register and the endpoint API
- [ ] Add delivery queue workers and re-check DNS/IP at the moment of delivery

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

2. Copy `.env.example` to `server/.env`, set `DATABASE_URL`, and generate separate random values for `JWT_SECRET` and `SECRET_ENCRYPTION_KEY` (at least 32 characters each). For example, run `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"` twice and use the two different outputs. Never commit `.env` or real secrets.

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

## API routes

| Method | Route | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api` | No | API identity and route discovery |
| GET | `/api/health` | No | API and database health |
| POST | `/api/auth/register` | No | Create account and return JWT |
| POST | `/api/auth/login` | No | Verify credentials and return JWT |
| GET | `/api/auth/me` | Bearer JWT | Return the current account |
| GET | `/api/endpoints` | Bearer JWT | List the current user's endpoints |
| POST | `/api/endpoints` | Bearer JWT | Create endpoint; signing secret is returned once |
| PATCH | `/api/endpoints/:id` | Bearer JWT | Update owned endpoint fields |
| DELETE | `/api/endpoints/:id` | Bearer JWT | Delete an owned endpoint |
| POST | `/api/endpoints/:id/rotate-secret` | Bearer JWT | Rotate and return a signing secret once |
| POST | `/api/events` | No (MVP) | Validate and persist an event (requires PostgreSQL) |

### Authentication example

```bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@example.com","password":"a-long-local-password","name":"Developer"}'
```

Use the returned `accessToken` as `Authorization: Bearer <token>` on `/api/endpoints` requests. Registration and login require `JWT_SECRET` to be configured.

### Endpoint creation example

```bash
curl -X POST http://localhost:4000/api/endpoints \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"payments-prod","url":"https://hooks.example.com/events","eventTypes":["payment.succeeded"]}'
```

The response includes `signingSecret` exactly once. Store it securely. Endpoint secrets are encrypted in the database using `SECRET_ENCRYPTION_KEY`; losing or changing that key makes previously encrypted secrets unreadable. Endpoint URLs are DNS-checked at creation/update time, but the delivery worker must repeat destination resolution and private-IP checks at send time to defend against DNS rebinding.

## Product roadmap

1. Workspace setup and dashboard foundation
2. Authentication and endpoint management
3. Event ingestion and validation
4. Redis queue and asynchronous delivery worker
5. HMAC signing, retries with exponential backoff and jitter
6. Delivery history, replay, and observability
7. Tests, security hardening, deployment, and documentation

## Security notes

Never commit real credentials or endpoint secrets. Endpoint signing secrets are encrypted at rest using AES-256-GCM and returned only at creation or rotation. Never commit real credentials. URL validation blocks local/private IPs and checks DNS at endpoint creation/update time; delivery workers must repeat DNS resolution, validate every redirect, and enforce destination IP checks immediately before sending to mitigate DNS rebinding. Production deployment should also add rate limiting, abuse monitoring, and a key-rotation procedure.

## License

Not licensed for redistribution yet.
