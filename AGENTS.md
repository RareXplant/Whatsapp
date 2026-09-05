# AGENTS.md — whatsapp-multi-gateway

## Project Overview
Production-grade, multi-tenant WhatsApp API Gateway + Web Dashboard built on Baileys v7 (RC).

## Architecture
Clean Architecture / Hexagonal. Layers: Domain → Application → Infrastructure → Interfaces.

## Key Rules
1. Domain layer MUST NOT import Express, Mongoose, Socket.IO, or Baileys.
2. Baileys is an infrastructure adapter only.
3. All environment variables parsed ONLY in `src/config.ts` via Zod.
4. Use structured Pino logging — never `console.log` or `console.error`.
5. All tenant-owned entities MUST contain `tenantId` and be scoped.
6. Never log secrets: passwords, JWT keys, API keys, webhook secrets, auth creds, Signal keys.
7. Use `BufferJSON.replacer`/`BufferJSON.reviver` for Baileys auth state serialization.
8. Use `@whiskeysockets/baileys` pinned at `7.0.0-rc14`.
9. Tests use Vitest. Unit tests must not create real WhatsApp connections.
10. Use Zod for ALL validation (env, requests, params, body).
11. API responses use consistent envelope: `{ success, data/error, requestId }`.
12. No `any` types. Use `unknown` + runtime validation where needed.
13. Every retryable operation needs: max attempts, jitter, cancellation, logging.
14. QR handling via `connection.update` event (v7 removed `printQRInTerminal`).
15. Use `makeCacheableSignalKeyStore` scoped per instance.
16. Instance sockets stored in a Map with async-lock for concurrency safety.

## Testing
- Unit: `npm run test:unit`
- Integration: `npm run test:integration`
- E2E: `npm run test:e2e`
- All: `npm test`
- Coverage: `npm run test:coverage`

## Validation
Before declaring done:
1. `npm run typecheck` passes
2. `npm run lint` passes
3. `npm run format` passes
4. `npm test` passes
5. `npm run build` succeeds
6. Application starts and responds to /health and /ready
