# whatsapp-multi-gateway — Frontend Implementation Plan (PART 2)

## Overview

This document outlines the implementation plan for the frontend dashboard, inspired by MultiWA UX patterns while integrating with our existing backend APIs.

## Current State (End of PART 1)

- ✅ Backend fully implemented with Clean Architecture
- ✅ Baileys v7.0.0-rc14 integration complete
- ✅ MongoDB authentication state working
- ✅ JWT + API key authentication
- ✅ RBAC (owner/admin/operator/viewer)
- ✅ Socket.IO real-time events
- ✅ Webhooks with HMAC signing
- ✅ All unit tests passing (145 tests)
- ✅ All integration tests passing (22 tests)
- ✅ Typecheck, lint, format all passing
- ✅ Docker build working
- ⚠️ Frontend: Basic single-file HTML/JS in `/public/index.html` (1022 lines)

## Frontend Goals

### 1. Technology Stack

- **Next.js 14** (App Router)
- **TypeScript** (strict mode)
- **Tailwind CSS**
- **shadcn/ui** components
- **TanStack Query** (server state)
- **Socket.IO Client**
- **Zustand** (minimal client state)

### 2. Routes Structure

```
/login              — Authentication
/dashboard          — Main dashboard with stats
/accounts           — Instance list
/accounts/[id]      — Instance detail
/accounts/[id]/chats — Chat interface
/accounts/[id]/groups — Groups list
/webhooks           — Webhook management
/api-keys           — API key management
/audit              — Audit log viewer
/settings           — Safe settings display
```

### 3. Key Features

#### Dashboard
- Total accounts count
- Connected/disconnected/QR-required breakdown
- Messages sent/received today
- Recent activity feed
- Connection events timeline

#### Accounts Page
- Grid/card view of instances
- Status indicators (connected, connecting, QR, disconnected)
- Quick actions (connect, QR, pair, disconnect, logout, delete)
- Multi-account switcher (critical UX)

#### New Account Flow
1. Create instance via API
2. Show QR modal or pairing code input
3. Socket.IO updates for state changes
4. Auto-close on connection

#### Chat UI
- WhatsApp Web-inspired layout
- Left: Chat list with avatars, last message, timestamps, unread count
- Center: Conversation with message bubbles
- Composer with text + emoji + attachment support
- Pagination for large histories

#### Real-time Updates
- Subscribe to tenant/instance rooms
- Handle events: qr, pairing-code, connected, disconnected, message.received
- TanStack Query invalidation on socket events
- Connection status indicator (connected/reconnecting/offline)

### 4. Security Requirements

- No secrets in localStorage beyond JWT (short-lived)
- Secure cookies preferred where compatible
- No Signal keys, auth state, or webhook secrets exposed
- Tenant isolation enforced via backend (not trusted frontend)
- RBAC-based UI element visibility

### 5. Responsive Design

Breakpoints:
- 1920px (desktop large)
- 1440px (desktop)
- 1280px (laptop)
- 1024px (tablet landscape)
- 768px (tablet portrait)
- Mobile (< 640px)

Mobile adaptations:
- Sidebar → drawer navigation
- Chat list → full screen on selection
- Account selector always accessible

### 6. UI States

Every major screen must handle:
- Loading (skeleton screens)
- Empty states with CTAs
- Error states with retry
- Permission denied
- Offline/backend unavailable
- Success confirmations

### 7. Testing Strategy

#### Playwright E2E Tests
- Login/logout flow
- Dashboard rendering
- Account switching
- QR state visualization
- Chat list + conversation
- Message composer
- Webhook page
- API key creation (show once warning)
- Audit log pagination

#### Mocking Strategy
- Mock backend API at interface boundary (MSW)
- Mock Socket.IO events
- No real WhatsApp account in CI
- Separate manual test plan for real WhatsApp testing

### 8. Performance Considerations

- Server-side pagination for chats/messages
- Cursor-based pagination for large datasets
- Debounced search inputs
- Virtualized lists for long chat histories
- TanStack Query caching strategy
- Socket.IO reconnection handling

### 9. Implementation Phases

#### Phase 1: Foundation (Week 1)
- [ ] Next.js project setup
- [ ] Tailwind + shadcn/ui configuration
- [ ] Authentication context + protected routes
- [ ] API client with Zod validation
- [ ] Socket.IO hook with reconnection logic
- [ ] Layout components (sidebar, header, mobile nav)

#### Phase 2: Core Pages (Week 2)
- [ ] Login page
- [ ] Dashboard with real stats
- [ ] Accounts list page
- [ ] Instance detail page
- [ ] QR/pairing modal component

#### Phase 3: Chat Interface (Week 3)
- [ ] Chat list component
- [ ] Conversation view
- [ ] Message composer
- [ ] Real-time message updates
- [ ] Media preview (if supported)

#### Phase 4: Management Pages (Week 4)
- [ ] Webhook configuration page
- [ ] API key management
- [ ] Audit log viewer
- [ ] Settings page

#### Phase 5: Polish & Testing (Week 5)
- [ ] Responsive design refinements
- [ ] Loading/error states
- [ ] Accessibility audit
- [ ] Playwright E2E tests
- [ ] Performance optimization

### 10. Integration Points

| Feature | Backend Endpoint | Socket Event |
|---------|-----------------|--------------|
| Login | POST /api/v1/auth/login | - |
| List instances | GET /api/v1/instances | instance.updated |
| Get QR | GET /api/v1/instances/:id/qr | instance.qr |
| Request pairing | POST /api/v1/instances/:id/pairing | instance.pairingCode |
| Connect status | GET /api/v1/instances/:id/qr/status | instance.connected, instance.disconnected |
| Send message | POST /api/v1/instances/:id/messages/text | message.sent |
| Receive message | - | message.received |
| List chats | GET /api/v1/instances/:id/chats | - |
| Get messages | GET /api/v1/instances/:id/chats/:jid/messages | message.received |
| Webhook config | GET/PUT /api/v1/instances/:id/webhook | webhook.failed |
| API keys | GET/POST/DELETE /api/v1/auth/api-keys | - |
| Audit log | GET /api/v1/audit | - |

### 11. State Management

#### Server State (TanStack Query)
- User session
- Instances list
- Instance details
- Chats
- Messages
- Webhooks
- API keys
- Audit logs

#### Client State (Zustand - minimal)
- Current selected instance ID
- Sidebar open/close (mobile)
- Theme preference (dark/light)
- Toast notifications queue

### 12. Component Library (shadcn/ui)

Required components:
- Button, Input, Label, Select, Textarea
- Card, Badge, Avatar
- Dialog, Sheet (drawer), DropdownMenu
- Table, Skeleton, Progress
- Tabs, ScrollArea
- Toast/Sonner
- Form (React Hook Form + Zod)

### 13. File Structure

```
apps/web/
├── app/
│   ├── (auth)/
│   │   └── login/
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── dashboard/
│   │   ├── accounts/
│   │   │   ├── page.tsx
│   │   │   └── [id]/
│   │   ├── webhooks/
│   │   ├── api-keys/
│   │   ├── audit/
│   │   └── settings/
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ui/ (shadcn)
│   ├── layout/
│   ├── dashboard/
│   ├── accounts/
│   ├── chat/
│   └── shared/
├── lib/
│   ├── api-client.ts
│   ├── socket.ts
│   ├── auth.ts
│   └── utils.ts
├── hooks/
│   ├── use-auth.ts
│   ├── use-socket.ts
│   └── use-instances.ts
├── stores/
│   └── app-store.ts
└── types/
    └── api.ts
```

### 14. Known Limitations

- Baileys v7.0.0-rc14 pairing code support varies by WhatsApp version
- Media sending requires additional backend endpoints (currently text only)
- Group management features limited to viewing metadata
- No voice/video call support (Baileys limitation)

### 15. Manual Testing Checklist (Real WhatsApp Required)

- [ ] QR scan login flow
- [ ] Pairing code login (if supported)
- [ ] Send text message
- [ ] Receive text message
- [ ] Disconnect/reconnect cycle
- [ ] Logout and re-login
- [ ] Multiple instances simultaneously
- [ ] Webhook delivery verification
- [ ] Socket.IO real-time updates under load

---

## Definition of Done (Frontend)

- [ ] All routes implemented and responsive
- [ ] Authentication flow complete
- [ ] Real-time Socket.IO integration working
- [ ] Multi-account switching functional
- [ ] Chat UI with pagination
- [ ] Webhook/API-key/audit pages complete
- [ ] Playwright E2E tests passing
- [ ] No TypeScript errors
- [ ] Accessibility basics met
- [ ] Production Docker build includes frontend
- [ ] Documentation updated
