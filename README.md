# Smart Environment Dashboard System

A comprehensive web application for monitoring environmental parameters in real time, built with Next.js, TypeScript, Tailwind CSS, and Prisma.

## Features

- Real-time environmental data monitoring
- Live updates over Server-Sent Events (no polling)
- Interactive dashboards with charts and visualizations
- Sensor management and data collection
- User roles: Administrator, Environmental Analyst, Public User, Field Technician
- Community campaigns, groups with members-only chat, fundraisers and donations
- Historical data analysis
- Alert system for environmental conditions

## Tech Stack

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS, Recharts
- **Backend**: Next.js API Routes
- **Database**: SQLite with Prisma ORM
- **Validation**: zod
- **Authentication**: JWT (Bearer tokens)
- **Deployment**: Vercel (see *Deployment notes* — the realtime layer needs one instance)

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure the environment:
   ```bash
   cp .env.example .env
   ```
   Then set `JWT_SECRET` to a random 32+ character string. The app refuses to
   start without one — there is deliberately no default, because a predictable
   secret lets anyone forge a token for any account:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

4. Set up the database:
   ```bash
   npx prisma generate
   npx prisma db push
   npx tsx prisma/seed.ts
   ```
   `prisma/dev.db` is intentionally not tracked in git — it is a local
   artifact, and a committed database leaks the password hashes of everyone
   who ever registered against it.

5. Run the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

The seed creates `admin@example.com` and `analyst@example.com`, both with the
password `password`. They are demo accounts: do not deploy with them.

## Project Structure

- `app/` - Next.js app directory with pages and API routes
- `components/` - React components
- `lib/` - Utility functions and database client
  - `auth.ts` / `api-auth.ts` - token signing and the route guards
  - `validation.ts` - zod schemas for every endpoint
  - `events.ts` - in-process pub/sub behind the SSE stream
  - `rate-limit.ts` - fixed-window limiter
  - `api-client.ts` / `use-event-stream.ts` - browser-side helpers
- `prisma/` - Database schema and seed files

## Authentication

`POST /api/auth/login` and `/api/auth/register` return a JWT. Send it on every
mutating request:

```
Authorization: Bearer <token>
```

**The caller's identity always comes from that token, never from the request
body.** Endpoints do not accept `userId` or `creatorId` — a body field is
chosen by the caller, so accepting one lets anyone act as anyone else. If you
add an endpoint, use `requireAuth`/`requireRole` from `lib/api-auth.ts` and
take the id from `auth.user.id`.

Tokens expire after 7 days.

## API Endpoints

Reads are public (the dashboard serves anonymous visitors). Writes need a
token, and some need a role.

| Method | Endpoint | Auth |
| --- | --- | --- |
| `POST` | `/api/auth/register` | none — 5/hour per IP |
| `POST` | `/api/auth/login` | none — 10 per 15 min per IP+email |
| `GET` | `/api/sensors` | none |
| `GET` | `/api/data?sensorId=&limit=` | none |
| `POST` | `/api/data` | technician, admin |
| `GET` | `/api/alerts` | none |
| `POST` | `/api/alerts` | technician, analyst, admin |
| `GET` | `/api/news` | none |
| `GET` | `/api/campaigns?page=&limit=` | none |
| `POST` | `/api/campaigns` | any signed-in user |
| `POST` | `/api/campaigns/join` | any signed-in user |
| `GET` | `/api/groups?page=&limit=` | none |
| `POST` | `/api/groups` | any signed-in user |
| `POST` | `/api/groups/join` | any signed-in user |
| `GET` | `/api/messages?groupId=` | **group members only** |
| `POST` | `/api/messages` | **group members only** |
| `GET` | `/api/fundraisers?page=&limit=` | none |
| `POST` | `/api/fundraisers` | any signed-in user |
| `POST` | `/api/fundraisers/donate` | any signed-in user |
| `GET` | `/api/events` | optional — see below |

List endpoints return `{ items, page, limit, total, totalPages }`.

Listings identify people by `id` and `name` only. They never include other
users' email addresses.

## Realtime (`GET /api/events`)

An SSE stream. Anonymous clients receive the public events; sending a token
additionally streams chat from the caller's own groups.

| Event | Audience |
| --- | --- |
| `ready` | on connect |
| `sensor:data` | public |
| `alert:new` | public |
| `donation:new` | public — amount and running total, never the donor |
| `campaign:new`, `group:new` | public |
| `message:new` | members of that group only |

Group membership is resolved when the stream connects, so a client that joins
a group must reconnect before its chat arrives (`useEventStream` does this via
its `reconnectKey`).

Browsers cannot set an `Authorization` header on `EventSource`, so the client
uses `fetch` + `ReadableStream` instead. The alternative — a token in the query
string — would leak it into access logs and browser history.

## Deployment notes

Two pieces of state live in the Node process rather than a shared store:

- the SSE subscriber set (`lib/events.ts`)
- the rate-limit counters (`lib/rate-limit.ts`)

Both are correct on a single instance and both break silently across several:
events only reach clients on the instance that served the write, and the rate
limit becomes per-instance. Running more than one replica — including Vercel's
serverless functions — needs a shared broker (Redis pub/sub, Ably, Pusher) and
a shared counter store.

SQLite has the same shape of constraint: it is a file on one disk. A
multi-instance deployment wants Postgres.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

MIT
