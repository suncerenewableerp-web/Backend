# Sunce ERP — Backend API

Express + MongoDB REST API for the Sunce Solar Inverter Service Management Platform.

---

## Tech Stack

| Layer        | Technology              |
|-------------|-------------------------|
| Runtime     | Node.js 18+             |
| Framework   | Express 4               |
| Database    | MongoDB + Mongoose 8    |
| Auth        | JWT (access + refresh)  |
| Validation  | express-validator        |
| Security    | helmet, cors, rate-limit |
| Logging     | morgan                  |

---

## Project Structure

```
backend/Backend/
├── src/
│   ├── index.ts                  # App entry point
│   ├── config/
│   │   └── seed.ts               # DB seed script
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── user.controller.ts
│   │   ├── ticket.controller.ts
│   │   ├── role.controller.ts
│   │   ├── jobcard.controller.ts
│   │   ├── logistics.controller.ts
│   │   ├── sla.controller.ts
│   │   ├── report.controller.ts
│   │   └── dashboard.controller.ts
│   ├── models/
│   │   ├── User.model.ts
│   │   ├── Role.model.ts
│   │   ├── Ticket.model.ts
│   │   ├── JobCard.model.ts
│   │   └── Logistics.model.ts
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── user.routes.ts
│   │   ├── ticket.routes.ts
│   │   ├── role.routes.ts
│   │   ├── jobcard.routes.ts
│   │   ├── logistics.routes.ts
│   │   ├── sla.routes.ts
│   │   ├── report.routes.ts
│   │   └── dashboard.routes.ts
│   ├── middleware/
│   │   ├── auth.middleware.ts    # JWT verify + permission check
│   │   ├── error.middleware.ts   # Global error handler
│   │   └── validate.middleware.ts
│   └── utils/
│       └── helpers.ts
├── uploads/                      # File uploads (gitignored)
├── .env.example
├── .gitignore
└── package.json
```

---

## Setup

### 1. Install dependencies
```bash
cd backend/Backend
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env — set your MONGODB_URI and JWT_SECRET
```

Notes:
- If you deploy behind a reverse proxy/load balancer, set `TRUST_PROXY=1` so `req.ip` and rate limiting work per-client.
- If many users login from the same network/IP (office Wi‑Fi), increase `AUTH_RATE_LIMIT_MAX` (and optionally `RATE_LIMIT_MAX`) in `.env`.
- To enable password reset emails, set `SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS` (or `SMTP_URL`) and `SMTP_FROM` in `.env`.

### 3. Seed the database
```bash
npm run seed
```

### 4. Start the server
```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

Server starts at: `http://localhost:5000`  
Health check: `http://localhost:5000/health`

---

## Demo Credentials (after seeding)

| Role     | Email                    | Password     |
|----------|--------------------------|--------------|
| Admin    | admin@sunce.in           | admin123     |
| Sales    | sales@sunce.in           | sales123     |
| Engineer | engineer@sunce.in        | engineer123  |
| Customer | customer@example.com     | customer123  |

---

## API Reference

All protected routes require:
```
Authorization: Bearer <accessToken>
```

### Auth  `/api/auth`

| Method | Endpoint              | Auth | Description            |
|--------|-----------------------|------|------------------------|
| POST   | /signup               | ✗    | Register new user      |
| POST   | /login                | ✗    | Login, get tokens      |
| POST   | /refresh              | ✗    | Refresh access token   |
| POST   | /logout               | ✓    | Invalidate token       |
| GET    | /me                   | ✓    | Get current user       |
| PATCH  | /change-password      | ✓    | Change password        |

#### Signup Request Body
```json
{
  "name": "Arjun Sharma",
  "email": "arjun@sunce.in",
  "password": "mypassword",
  "role": "ENGINEER",
  "phone": "+91 98765 43210",
  "company": "Sunce Renewables"
}
```

#### Login Response
```json
{
  "success": true,
  "data": {
    "user": { "_id": "...", "name": "...", "email": "...", "role": "ADMIN" },
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "role": { "name": "ADMIN", "permissions": { ... } }
  }
}
```

---

### Tickets  `/api/tickets`

| Method | Endpoint               | Permission           | Description           |
|--------|------------------------|----------------------|-----------------------|
| GET    | /                      | tickets:view         | List tickets          |
| POST   | /                      | tickets:create       | Create ticket         |
| POST   | /bulk                  | tickets:create       | Create tickets (bulk) |
| GET    | /:id                   | tickets:view         | Get ticket detail     |
| PUT    | /:id                   | tickets:edit         | Update ticket/status  |
| DELETE | /:id                   | tickets:delete       | Delete ticket         |
| GET    | /:id/history           | tickets:view         | Status history        |
| PATCH  | /:id/assign            | tickets:edit         | Assign engineer       |

#### Query Parameters (GET /)
| Param           | Example          | Description        |
|-----------------|------------------|--------------------|
| status          | DIAGNOSIS        | Filter by status   |
| priority        | HIGH             | Filter by priority |
| slaStatus       | BREACHED         | Filter by SLA      |
| search          | SR-2026          | Full-text search   |
| page            | 1                | Page number        |
| limit           | 20               | Items per page     |

#### Ticket Status Flow
```
CREATED → PICKUP_SCHEDULED → IN_TRANSIT → RECEIVED
       → DIAGNOSIS → REPAIR → TESTING → DISPATCHED → CLOSED
```

---

### Roles  `/api/roles`

| Method | Endpoint     | Permission | Description           |
|--------|--------------|------------|-----------------------|
| GET    | /            | Any auth   | List all roles        |
| GET    | /matrix      | users:view | Permission matrix     |
| POST   | /            | Admin only | Create role           |
| PUT    | /:id         | Admin only | Update role/perms     |
| DELETE | /:id         | Admin only | Delete custom role    |

#### Permissions Object Structure
```json
{
  "permissions": {
    "dashboard": { "view": true,  "create": false, "edit": false, "delete": false },
    "tickets":   { "view": true,  "create": true,  "edit": true,  "delete": false },
    "jobcard":   { "view": true,  "create": false, "edit": true,  "delete": false },
    "logistics": { "view": true,  "create": false, "edit": false, "delete": false },
    "sla":       { "view": true,  "create": false, "edit": false, "delete": false },
    "reports":   { "view": false, "create": false, "edit": false, "delete": false },
    "users":     { "view": false, "create": false, "edit": false, "delete": false },
    "settings":  { "view": false, "create": false, "edit": false, "delete": false }
  }
}
```

---

### Users  `/api/users`

| Method | Endpoint       | Permission   | Description        |
|--------|----------------|--------------|--------------------|
| GET    | /              | users:view   | All users          |
| GET    | /engineers     | Any auth     | Engineers list     |
| GET    | /:id           | users:view   | Single user        |
| PUT    | /:id           | users:edit   | Update user        |
| DELETE | /:id           | users:delete | Deactivate user    |
| PATCH  | /profile       | Any auth     | Update own profile |

---

### Job Cards  `/api/jobcards`

| Method | Endpoint      | Permission     | Description        |
|--------|---------------|----------------|--------------------|
| GET    | /             | jobcard:view   | List job cards     |
| POST   | /             | jobcard:create | Create job card    |
| GET    | /:id          | jobcard:view   | Job card detail    |
| PUT    | /:id          | jobcard:edit   | Update job card    |
| POST   | /:id/parts    | jobcard:edit   | Add spare part     |

---

### Logistics  `/api/logistics`

| Method | Endpoint              | Permission        | Description         |
|--------|-----------------------|-------------------|---------------------|
| GET    | /                     | logistics:view    | All logistics       |
| POST   | /                     | logistics:create  | Schedule pickup     |
| GET    | /ticket/:ticketId     | logistics:view    | By ticket           |
| GET    | /:id                  | logistics:view    | Single record       |
| PUT    | /:id                  | logistics:edit    | Update LR/tracking  |

---

### SLA  `/api/sla`

| Method | Endpoint              | Permission   | Description         |
|--------|-----------------------|--------------|---------------------|
| GET    | /                     | sla:view     | SLA overview        |
| GET    | /ticket/:ticketId     | sla:view     | SLA by ticket       |
| POST   | /recalculate          | Admin only   | Batch recalculate   |

---

### Reports  `/api/reports`

| Method | Endpoint            | Permission     | Description       |
|--------|---------------------|----------------|-------------------|
| GET    | /                   | reports:view   | Reports overview  |
| GET    | /export/tickets     | reports:view   | Download CSV      |

---

### Dashboard  `/api/dashboard`

| Method | Endpoint | Permission      | Description     |
|--------|----------|-----------------|-----------------|
| GET    | /        | dashboard:view  | KPIs + charts   |

---

## Connecting Frontend

In your Next.js frontend, set the API base URL:

```js
// .env.local
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

Example fetch call:
```js
const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const data = await res.json();
// Store data.data.accessToken in localStorage or cookie
```

---

## Role-Based Access

The `authorize(module, action)` middleware checks `roles` collection at runtime — so any role permission changes via the API take effect immediately without restarting the server.

```
authenticate → verify JWT → load user → load roleDef from DB
authorize    → check roleDef.permissions[module][action]
```

---

## Error Format

All errors follow this structure:
```json
{
  "success": false,
  "message": "Descriptive error message",
  "errors": [{ "field": "email", "message": "Valid email required" }]
}
```

---

## Production Checklist

- [ ] Set strong `JWT_SECRET` and `JWT_REFRESH_SECRET`
- [ ] Use MongoDB Atlas connection string
- [ ] Set `NODE_ENV=production`
- [ ] Set `FRONTEND_URL` to your deployed frontend domain
- [ ] Enable HTTPS / use a reverse proxy (nginx)
- [ ] Run `npm run seed` once on first deploy
