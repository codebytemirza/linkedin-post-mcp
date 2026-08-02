# MCP LinkedIn Poster

A production-ready [Model Context Protocol](https://modelcontextprotocol.io) server that lets **Claude, Codex, Antigravity, or any MCP client** publish LinkedIn posts — text or images — on your behalf via natural language.

Built as plain **Vercel serverless functions** (no framework), using the **MCP TypeScript SDK v2** with **Streamable HTTP** transport for remote use and a **stdio** entry for local desktop agents, **Upstash Redis** for token storage, and a hand-rolled **OAuth 2.0** flow against LinkedIn (no SDK, raw `fetch()`).

---

## ✨ Features

- **Text posts** — publish a wall of your feed with a caption (`create_post`).
- **Image posts** — single-image or multi-image (carousel) posts with alt text (`create_image_post`).
- **Reliable image rendering** — after uploading, the server **polls LinkedIn's image status until `AVAILABLE`** before posting, so images never appear blank (see [Image upload](#image-upload) below).
- **Profile lookup** — return your name & email.
- **Auth health checks** — know exactly when your token expires.
- **Admin dashboard** — a web UI (`/api/dashboard`) showing auth status, tool logs, and posted activity.
- **Two transports** — production Streamable HTTP on Vercel, plus a bundled **stdio** entry for Claude Desktop / Codex / Antigravity running locally.

## 🧱 Tools

| Tool | Input | Returns |
|------|-------|---------|
| `create_post` | `text`, `visibility?` (`PUBLIC`/`CONNECTIONS`) | created post ID |
| `create_image_post` | `caption`, `images: [{base64, mediaType?, altText?}]` (1–20), `visibility?` | created post ID |
| `get_profile` | — | name + email |
| `check_auth_status` | — | token existence, validity, and expiry times |

## 🗂 Architecture

```
api/
  authorize.ts   GET   -> redirects to LinkedIn OAuth consent screen (CSRF `state` in Redis)
  callback.ts    GET   -> validates state, exchanges code for tokens, stores them, success page
  mcp.ts         POST  -> the MCP endpoint (Streamable HTTP), bearer-auth, all tools
  dashboard.ts   GET   -> admin dashboard API (auth status, tool logs, activity)
frontend/               -> React + Tailwind + MUI dashboard source (built to public/)
lib/
  config.ts             env vars, URLs, Redis client (Redis.fromEnv())
  linkedin-auth.ts      getValidAccessToken(), token exchange, refresh, CSRF helpers
  linkedin-api.ts       fetchProfile(), createLinkedInPost(), createLinkedInImagePost()
  logging.ts            structured tool/error logging to Redis
  errors.ts             NotAuthorizedError, LinkedInError
mcp-stdio.mjs           esbuild-bundled → stdio entry for local clients
mcp-stdio-entry.mjs     source entry consumed by the esbuild step
```

Key design points:

- Tokens live under the single Redis key **`linkedin:tokens`**.
- The MCP endpoint is stateless and requires `Authorization: Bearer <MCP_AUTH_TOKEN>` on **every** request.
- All LinkedIn calls use raw `fetch()` — no SDK.

---

## 🚀 Prerequisites

- **Node.js 24+** (pinned via `engines`).
- A **LinkedIn Developer app** with the approved scopes: `openid`, `profile`, `email`, `w_member_social`.
- An **Upstash Redis** database (REST URL + token).
- **Vercel** account + CLI for deployment.

### Environment variables

Set these in Vercel (and a root `.env` for local dev):

| Variable | Purpose |
|----------|---------|
| `LINKEDIN_CLIENT_ID` | LinkedIn app Client ID |
| `LINKEDIN_CLIENT_SECRET` | LinkedIn app Client Secret |
| `LINKEDIN_REDIRECT_URI` | Must match a whitelisted redirect URL **exactly** |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token |
| `MCP_AUTH_TOKEN` | Bearer token all MCP clients send to `/api/mcp` |

> 🔒 Never commit these. `.env`, `.env.local` are git-ignored; Vercel stores them as environment variables.

---

## 🧪 Local development

```bash
npm install
vercel dev          # serves http://localhost:3000/api/...
npm run typecheck   # tsc --noEmit
```

Env vars for local dev are read from a root `.env` file. Use these **Redirect URIs** (whitelist whichever you use in the [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps)):

```env
# local (vercel dev)
LINKEDIN_REDIRECT_URI=http://localhost:3000/api/callback

# production (Vercel)
LINKEDIN_REDIRECT_URI=https://post-mcp.vercel.app/api/callback
```

LinkedIn only talks to URLs it trusts, and matching is **exact** (no query params, no `#`).

---

## 🔐 How OAuth works end to end

1. **`/api/authorize`** — generates a random CSRF `state`, saves it to Redis (`PENDING_STATE_KEY`, 10‑min TTL), and 302-redirects your browser to LinkedIn with `response_type=code`, `client_id`, `redirect_uri`, and the scopes.
2. **LinkedIn** authenticates you and redirects back to `/api/callback?code=…&state=…`.
3. **`/api/callback`** — validates `state`, `POST`s to the token endpoint with `grant_type=authorization_code`, stores `access_token`, `expires_in`, `refresh_token`, `refresh_token_expires_in` in `linkedin:tokens`, and shows a success page.
4. **MCP tools** — `getValidAccessToken()` reads `linkedin:tokens`; if the access token is near expiry **and a refresh token exists**, it mints a new one and updates Redis. It throws `NotAuthorizedError` if no tokens exist.

> **Important:** LinkedIn only issues `refresh_token` when your app is provisioned for *programmatic refresh* (a limited set of partners). With the standard consumer scope set it typically no refresh token, so access tokens last **60 days** and the user re‑authorizes when they expire. `check_auth_status` reports the real state either way.

### Connect the account once

Open in a browser once to authorize the MCP server to post on your behalf:

```
https://post-mcp.vercel.app/api/authorize
```

---

## 🖼 Image upload (why images never go blank)

LinkedIn's **Images API** uploads **asynchronously** — if a post is created before the image finishes processing, the feed renders a **blank image**. This server avoids that by:

1. `initializeUpload` → get a signed `uploadUrl` + URN.
2. `PUT` the image bytes (`image/jpeg`, `image/png`, `image/gif`).
3. **Poll `GET /rest/images/{urn}` until `status: AVAILABLE`** (a `downloadUrl` is present), then create the post.

Only fully processed images are attached to the post, so it always renders correctly.

---

## 🤝 Connect an MCP client

### Remote (any MCP client) via Streamable HTTP

- **Type:** Custom / MCP server (Streamable HTTP)
- **Endpoint (URL):** `https://post-mcp.vercel.app/api/mcp`
- **Authentication → Authorization header:** `Bearer <MCP_AUTH_TOKEN>`

For example in Claude (`claude.ai → Settings → Connectors → MCP`), enter the URL and the bearer header.

### Local (Claude Desktop / Codex / Antigravity) via stdio

The bundled `mcp-stdio.mjs` entry reads your `.env` itself and serves the same tools over stdio, so no deployment is needed to use it locally. Point the client at:

```
node D:\mcp-post\mcp-stdio.mjs
```

---

## ☁️ Deploy to Vercel

```bash
vercel           # preview
vercel --prod    # production
```

- `vercel.json` pins the `api/**` functions to the **Node.js 24** runtime (or your `engines` value).
- `LINKEDIN_REDIRECT_URI` must be the production callback URL and be whitelisted in LinkedIn.
- After deploying, run `/api/authorize` once, then the tools work.
- Build output `public/` is generated from `frontend/` and is git-ignored; the dashboard source lives in `frontend/src`.

---

## 🔒 Security notes

- Secrets are read only from environment variables; **nothing is logged**.
- Every `/api/mcp` request requires the bearer token before any protocol handling.
- OAuth `state` prevents CSRF; short TTL, consumed (deleted) on use.
- `.env` / `.env.local` / `.vercel` / `node_modules` / `tmp` / build output are all git-ignored.

## 🧹 Maintenance

- `npm run typecheck` — type-check the whole project.
- Rebuild the stdio bundle after editing source: `esbuild mcp-stdio-entry.mjs → mcp-stdio.mjs`.
- Redeploy with `vercel --prod` whenever serverless/API code changes.