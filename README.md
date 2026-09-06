# whatsapp-multi-gateway

Production-grade multi-tenant WhatsApp API Gateway + Web Dashboard built on Baileys v7.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)
![MongoDB](https://img.shields.io/badge/mongodb-%3E%3D6-brightgreen)

## Overview

`whatsapp-multi-gateway` is a self-hostable, multi-tenant gateway that exposes a REST API, a real-time Socket.IO dashboard feed and HMAC-signed webhooks around one or many independent WhatsApp connections. Each tenant manages its own instances, credentials, API keys and webhook configurations in complete isolation.

It is built on **Baileys v7 (7.0.0-rc14)** and follows a **Clean Architecture / Hexagonal** design: Domain, Application, Infrastructure and Interfaces layers with strict dependency rules.

## Features

- **Multi-tenant isolation** — every tenant-owned entity is scoped by `tenantId`; repositories, socket rooms and instance ownership checks all enforce tenancy.
- **WhatsApp instances via Baileys v7.0.0-rc14** — one independent Baileys connection per instance, stored in a `Map` guarded by `async-mutex`.
- **QR and pairing code flows** — connect via scannable QR or phone-number pairing code.
- **Send and receive messages** — send text messages via the API; inbound/updated messages are persisted and forwarded to webhooks and the realtime feed.
- **HMAC-signed webhooks** — every delivery is signed (`X-WA-Signature`) with the instance's webhook secret and retried with exponential backoff.
- **Real-time Socket.IO dashboard** — authenticated live events for QR codes, connection state and messages, routed into per-tenant rooms.
- **JWT + API keys + RBAC** — Bearer tokens from login, revocable API keys (`wag_...`), and fine-grained roles (`owner`/`admin`/`operator`/`viewer`).
- **Audit log** — append-only history of auth, instance and webhook actions per tenant.
- **Rate limiting** — in-memory global limiter plus a stricter limiter on auth endpoints.
- **Prometheus metrics** — `/api/v1/metrics` endpoint backed by `prom-client`.
- **Media storage** — local filesystem storage (`MEDIA_STORAGE=local`), with an S3 mode available in configuration.

## Architecture

The project follows a hexagonal / ports-and-adapters layout. The **domain** layer is the heart and never depends on any framework.

```
+----------------------------------------------------------------------------------+
|                            INTERFACES (delivery)                                 |
|   HTTP/Express (routes, middleware, schemas)   |   Realtime (Socket.IO)          |
+---------------------------------------+------------------------------------------+
                                        |
+---------------------------------------+------------------------------------------+
|                            APPLICATION (use-case orchestration)                  |
|   AuthService, InstanceService, MessageService, WebhookService, AuditService,    |
|   StartupService                                                                 |
+---------------------------------------+------------------------------------------+
                                        |
+---------------------------------------+------------------------------------------+
|                            INFRASTRUCTURE (adapters)                             |
|   Baileys/WhatsAppManager  |  MongoDB/Mongoose  |  WebhookDispatcher  |  Metrics  |
+---------------------------------------+------------------------------------------+
                                        |
+---------------------------------------+------------------------------------------+
|                              DOMAIN (entities + ports)                           |
|   Instance, User, Tenant, Message, WebhookDelivery, AuditLog + port interfaces    |
+----------------------------------------------------------------------------------+
```

Hexagon rules:

- The **domain** layer MUST NOT import Express, Mongoose, Socket.IO or Baileys.
- **Baileys** is an infrastructure adapter only and is pinned at `7.0.0-rc14`.
- All environment variables are parsed only in `src/config.ts` via Zod.
- All tenant-owned entities carry a `tenantId` and are always scoped in queries.

## Requirements

- **Node.js >= 20**
- **MongoDB >= 6** (Docker image `mongo:7` used in the provided compose file)
- Redis is **not** required. Although `ioredis` is listed as a dependency, it is not wired into the application — rate limiting and caching are in-memory.

## Quick Start

```bash
# 1. Copy the environment template
cp .env.example .env

# 2. Edit .env — at minimum set a strong JWT_SECRET (>= 32 chars) and API_KEY_PEPPER
#    JWT_SECRET=some-long-random-secret-at-least-32-chars

# 3. Install dependencies
npm install

# 4. Start MongoDB (the example URI expects the provided Compose service)
docker compose up -d mongodb

# 5. Start the dev server (default port 3333)
npm run dev
```

For MongoDB Atlas, replace `MONGODB_URI` with a working connection string and
ensure the machine can resolve the Atlas SRV record and that its IP is allowed
in the Atlas network access list. The application intentionally does not fall
back to another database after an explicit MongoDB connection fails.

Once running, verify the server:

```
GET http://localhost:3333/health   -> { success: true, data: { status: "ok", ... } }
GET http://localhost:3333/ready    -> { success: true, data: { status: "ok", database: "connected" } }
```

The HTTP server listens on `PORT` (default `3333`) and `HOST` (default `0.0.0.0`).

## Docker Quick Start

```bash
docker compose up --build
```

The compose file starts two services:

1. **mongodb** — `mongo:7` with a named volume for persistence and a `mongosh ping` healthcheck (`interval: 10s`, `retries: 5`, `start_period: 10s`).
2. **app** — the gateway, built from the multi-stage `Dockerfile` (node:20-alpine, non-root `appuser`, tini as init, and a `/health` HTTP healthcheck). It starts only after the Mongo service reports healthy.

The API is exposed on `http://localhost:3333`.

## Configuration Reference

All configuration is validated at startup by Zod in `src/config.ts` — the process exits with a clear error message if any variable is invalid. Secrets (JWT, API keys, etc.) are never logged.

| Variable | Default | Description |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development` \| `production` \| `test` |
| `PORT` | `3333` | HTTP server port |
| `HOST` | `0.0.0.0` | HTTP server bind host |
| `MONGODB_URI` | `mongodb://localhost:27017/whatsapp-gateway` | MongoDB connection string |
| `MONGODB_DB_NAME` | `whatsapp-gateway` | MongoDB database name |
| `JWT_SECRET` | dev default | Secret used to sign JWTs. **Min 32 characters.** |
| `JWT_EXPIRES_IN` | `24h` | JWT lifetime (see `jsonwebtoken` format) |
| `API_KEY_PEPPER` | dev default | **Min 8 characters.** Pepper used to hash API keys at rest. |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:3333` | Comma-separated allowed origins for CORS and Socket.IO |
| `RATE_LIMIT_ENABLED` | `true` | Global + strict rate limiting toggle |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Rate limiter window in ms |
| `RATE_LIMIT_MAX` | `100` | Max requests per window |
| `WEBHOOK_TIMEOUT_MS` | `10000` | Per-attempt webhook request timeout |
| `WEBHOOK_MAX_RETRIES` | `5` | Max retry attempts per delivery |
| `WEBHOOK_BASE_RETRY_MS` | `1000` | Base exponential backoff delay |
| `WEBHOOK_MAX_RETRY_MS` | `60000` | Cap on the backoff delay |
| `QR_TTL_SECONDS` | `30` | QR code time-to-live before refresh |
| `INSTANCE_STARTUP_CONCURRENCY` | `5` | Concurrent instance connections during startup |
| `MAX_RECONNECT_ATTEMPTS` | `10` | Max automatic reconnect attempts per instance |
| `MAX_RECONNECT_DELAY_MS` | `300000` | Cap on reconnect backoff delay |
| `LOG_LEVEL` | `info` | Pino log level (`fatal`..`trace`) |
| `METRICS_ENABLED` | `true` | Enable the `/api/v1/metrics` Prometheus endpoint |
| `MEDIA_STORAGE` | `local` | `local` \| `s3` |
| `DATA_DIR` | `./data` | Directory for local media/auth data |
| `AUTH_ENCRYPTION_KEY` | *(optional)* | Key to encrypt Baileys auth credentials at rest |
| `MAX_REQUEST_BODY_SIZE` | `10mb` | Express JSON/urlencoded body size limit |

## API Overview

Base path for API routes: `/api/v1`. Health routes are mounted at the root (`/health`, `/ready`). All API routes are protected except `login`, `/health` and `/ready`. Authentication is either `Authorization: Bearer <jwt>` or `X-API-Key: <key>`.

### Authentication (`/api/v1/auth`)

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| `POST` | `/api/v1/auth/login` | Log in with `email` + `password`, returns JWT + user + tenant | None (rate-limited) |
| `GET` | `/api/v1/auth/me` | Return current authenticated user + tenant | Bearer / API key |
| `POST` | `/api/v1/auth/api-keys` | Create an API key (returns `plaintextKey` once) | Bearer, owner/admin |
| `GET` | `/api/v1/auth/api-keys` | List API keys for the tenant | Bearer |
| `DELETE` | `/api/v1/auth/api-keys/:id` | Delete an API key | Bearer, owner/admin |

### Instances (`/api/v1/instances`)

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| `POST` | `/api/v1/instances` | Create an instance (QR or pairing) | Bearer, owner/admin/operator |
| `GET` | `/api/v1/instances` | List instances for the tenant | Bearer |
| `GET` | `/api/v1/instances/:id` | Get a single instance | Bearer |
| `GET` | `/api/v1/instances/:id/qr` | Get the current QR code | Bearer |
| `GET` | `/api/v1/instances/:id/qr/status` | Get instance status + connected flag | Bearer |
| `POST` | `/api/v1/instances/:id/pairing` | Request a pairing code (`phoneNumber`) | Bearer, operator |
| `POST` | `/api/v1/instances/:id/disconnect` | Disconnect the instance | Bearer, operator |
| `POST` | `/api/v1/instances/:id/reconnect` | Reconnect the instance | Bearer, operator |
| `POST` | `/api/v1/instances/:id/logout` | Log out of WhatsApp | Bearer, owner/admin |
| `DELETE` | `/api/v1/instances/:id` | Delete the instance | Bearer, owner/admin |
| `GET` | `/api/v1/instances/:id/chats` | List chats | Bearer |
| `GET` | `/api/v1/instances/:id/groups` | List groups | Bearer |
| `GET` | `/api/v1/instances/:id/webhook` | Read webhook config (URL + `hasSecret`) | Bearer |
| `PUT` | `/api/v1/instances/:id/webhook` | Update webhook URL/secret | Bearer, operator |
| `POST` | `/api/v1/instances/:id/webhook/test` | Send a test webhook delivery | Bearer, operator |

### Messages (`/api/v1`)

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| `POST` | `/api/v1/instances/:id/messages/text` | Send a text message (`to` + `text`) | Bearer, operator |
| `POST` | `/api/v1/messages/:id/send` | Compatibility alias for sending text | Bearer, operator |

### Audit (`/api/v1`)

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/v1/audit` | Query audit log (`instanceId`, `action`, `limit`, `cursor`) | Bearer, owner/admin |

### Services

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| `GET` | `/health` | Liveness probe (`status`, `uptime`, `timestamp`) | None |
| `GET` | `/ready` | Readiness probe (Mongo `connected`), 503 when unready | None |
| `GET` | `/api/v1/metrics` | Prometheus metrics | None |

### Response envelope

Every response (success or error) uses a consistent envelope:

```json
{
  "success": true,
  "data": { },
  "requestId": "req_..."
}
```

Errors use `{ "success": false, "error": { "code", "message", "details" }, "requestId" }`.

## Webhooks

Webhook deliveries are `POST` requests sent to the instance's configured `webhookUrl`.

### Signing

Every delivery body is signed using **HMAC-SHA256** of the raw JSON body with the instance's `webhookSecret`:

```
X-WA-Signature = HMAC-SHA256(secret, rawBody)  (hex)
```

Additional headers:

- `X-WA-Event` — the webhook event name (e.g. `message.received`)
- `X-WA-Delivery-Id` — a unique delivery identifier (`del_...`)
- `X-WA-Timestamp` — Unix epoch seconds
- `Content-Type: application/json`
- `User-Agent: whatsapp-multi-gateway/1.0.0`

Verify the signature with `crypto.createHmac('sha256', secret).update(rawBody).digest('hex')` and compare using a constant-time comparison.

### Retry behavior

- Each attempt has a timeout (`WEBHOOK_TIMEOUT_MS`, default `10s`).
- On failure (non-2xx or network error) delivery is retried with **exponential backoff + jitter** up to `WEBHOOK_MAX_RETRIES` (default `5`).
- Backoff: `min(base * 2^attempt, max)` + jitter, driven by `WEBHOOK_BASE_RETRY_MS` / `WEBHOOK_MAX_RETRY_MS`.
- Redirects are not followed (SSRF protection).
- Delivery state (`pending`, `retrying`, `success`, `failed`) is persisted in MongoDB for observability.

### Example payload — `message.received`

```json
{
  "instanceId": "inst_4f9d...",
  "messageId": "BAE5...",
  "remoteJid": "1234567890@s.whatsapp.net",
  "participant": null,
  "fromMe": false,
  "direction": "inbound",
  "messageType": "text",
  "text": "Hello!",
  "timestamp": "2026-01-01T12:00:00.000Z",
  "status": "received"
}
```

## Socket.IO Realtime Events

Connections authenticate with the same JWT used by the HTTP API (via `auth: { token }` or `Authorization: Bearer ...`). Connections are placed into a `tenant:{tenantId}` room and, after subscribing, into `tenant:{tenantId}:instance:{instanceId}` rooms so no QR/pairing/message data ever crosses tenants.

### Client events

| Event | Description |
| --- | --- |
| `subscribe-instance` | Join an instance room. Acknowledges `{ ok: true }` or `{ ok: false, error }` (returns an error if the instance is not found or not owned by the tenant). |
| `unsubscribe-instance` | Leave an instance room. Acknowledges `{ ok: true }`. |

### Server events

| Event | Payload key detail |
| --- | --- |
| `instance.qr` | `instanceId`, `qr`, `ttl` |
| `instance.pairingCode` | `instanceId`, `pairingCode` |
| `instance.connected` | `instanceId`, `phoneNumber`, `pushName`, `platform` |
| `instance.disconnected` | `instanceId`, `reason` |
| `instance.loggedOut` | `instanceId` |
| `message.received` | inbound message payload (`instanceId`, `messageId`, `remoteJid`, `text`, ...) |
| `message.updated` | message update payload (status changes) |
| `creds.updated` | `instanceId` |

## Authentication & Authorization

### JWT

- Obtained via `POST /api/v1/auth/login` (`email` + `password`).
- Sent as `Authorization: Bearer <token>` on protected routes.
- Lifetime defaults to `24h` (`JWT_EXPIRES_IN`).

### API Keys

- Created via `POST /api/v1/auth/api-keys` (owner/admin only).
- The plaintext key (`wag_<64-hex>`) is returned **once** at creation and cannot be retrieved again.
- The key is **hashed at rest** using HMAC-SHA256 with `API_KEY_PEPPER`.
- Sent as `X-API-Key: <key>` on protected routes.
- Keys carry optional `scopes` (default `["*"]`) and can be revoked.

### RBAC roles

Roles: `owner`, `admin`, `operator`, `viewer`.

| Resource | Roles allowed |
| --- | --- |
| Create instance, pairing, disconnect, reconnect, webhook update/test, send messages | owner, admin, operator |
| List/get instances, API keys, chats, groups, `/auth/me` | any authenticated role |
| Logout instance, delete instance, delete API keys | owner, admin |
| Create API keys | owner, admin |
| Read audit log | owner, admin |
| Read-only `viewer` | can read instances/users but cannot perform mutations |

## Multi-Tenant Isolation

- Every entity (`User`, `Instance`, `ApiKey`, `Message`, `WebhookDelivery`, `AuditLog`) carries a `tenantId`.
- Repository queries are always tenant-scoped (e.g. `findByTenantId`, and instance lookups verify ownership).
- Socket.IO rooms are keyed by tenant (`tenant:{id}` and `tenant:{id}:instance:{id}`), and subscription checks that the instance belongs to the caller's tenant.
- Webhook secrets and deliveries are resolved only when the instance's `tenantId` matches the caller's tenant.
- A `viewer`-tier API key (or a key whose linked user role is `viewer`) is limited to read-only access.

## Testing

```bash
npm run test:unit          # unit tests (vitest)
npm run test:integration   # integration tests (vitest)
npm run test:e2e           # e2e tests (vitest, vitest.e2e.config.ts)
npm run test:coverage      # coverage report
npm run validate           # format:check + lint + typecheck + unit + integration
npm test                   # run all vitest suites
```

- Unit tests target `tests/unit` and **never create real WhatsApp connections**.
- Integration tests use `mongodb-memory-server` (in-memory MongoDB) via supertest against the Express app.
- E2E tests run against the configured `vitest.e2e.config.ts`.

## Security Hardening

- **helmet** + **hpp** — secure headers and HTTP parameter pollution protection.
- **CORS** — configurable allow-list (`CORS_ORIGINS`).
- **Rate limiting** — global + stricter login limiter (in-memory).
- **SSRF protection for webhooks** — only `http`/`https`, no redirects, and DNS/IP resolution is checked against a blocklist covering private, loopback, link-local, multicast and reserved IPv4/IPv6 ranges.
- **Structured Pino logging with redaction** — sensitive keys (`password`, `secret`, `token`, `apiKey`, `creds`, `authState`, `webhookSecret`, `jwt`, ...) are replaced with `[REDACTED]`.
- **Secrets never logged** — JWT keys, API keys, webhook secrets and auth credentials are never written to logs or responses.
- **Envelope responses with `requestId`** — every request gets a `req_...` id for tracing.
- **Const-time signature comparison** — webhook signatures are verified with `crypto.timingSafeEqual`.
- **Non-root Docker** — the runtime container runs as `appuser` (UID 1001).

## Project Structure

```
.
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── public/                  # served static assets (dashboard entry, empty by default)
├── src/
│   ├── config.ts            # Zod-validated environment configuration
│   ├── logger.ts            # structured Pino logger
│   ├── index.ts             # bootstrap entry point
│   ├── app.ts               # dependency wiring + application context
│   ├── domain/
│   │   ├── entities/        # Instance, User, Tenant, Message, ApiKey, ...
│   │   └── ports/           # repository + service port interfaces
│   ├── application/
│   │   └── services/        # AuthService, InstanceService, MessageService, ...
│   ├── infrastructure/
│   │   ├── baileys/         # WhatsAppManager + BaileysTransport (the Baileys adapter)
│   │   ├── database/        # Mongoose connection, models, repositories
│   │   ├── webhooks/        # WebhookDispatcher (HMAC signing, SSRF guard, retries)
│   │   └── metrics/         # prom-client metrics
│   ├── interfaces/
│   │   ├── http/            # Express app, routes, middleware, zod schemas
│   │   └── realtime/        # Socket.IO service
│   └── shared/              # errors, crypto, validation, utils (BufferJSON)
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

## License

MIT.
#   W h a t s a p p  
 #   W h a t s a p p  
 