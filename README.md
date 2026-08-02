<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/banner.svg">
  <img src="assets/banner.svg" width="100%" max-width="1100" alt="MCP LinkedIn Poster banner">
</picture>

**Publish text and image posts to LinkedIn from any MCP client, via natural language.**

</div>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-24%2B-339933?logo=node.js&logoColor=white" alt="Node 24+">
  <img src="https://img.shields.io/badge/Transport-Streamable%20HTTP%20%2B%20stdio-0A66C2" alt="transport">
  <img src="https://img.shields.io/badge/Storage-Upstash%20Redis-DC382D" alt="Upstash Redis">
  <img src="https://img.shields.io/badge/OAuth2-LinkedIn%20Rest-0A66C2" alt="LinkedIn OAuth2">
  <img src="https://img.shields.io/github/license/codebytemirza/linkedin-post-mcp" alt="License">
</p>

---

## Highlights

- Text posts and single- or multi-image posts with alt text.
- Reliable image rendering: the server polls LinkedIn until the image is processed (`AVAILABLE`) so posts never render blank.
- Profile lookup and token expiry monitoring.
- Optional admin dashboard with auth status and tool logs.
- Two transports: production Streamable HTTP on Vercel, plus a bundled **stdio** entry for Claude Desktop / Codex / Antigravity.

---

## MCP tools

| Tool | Input | Returns |
|------|-------|---------|
| `create_post` | `text`, `visibility?` | created post ID |
| `create_image_post` | `caption`, `images[1..20]`, `visibility?` | created post ID |
| `get_profile` | - | name + email |
| `check_auth_status` | - | token validity and expiry |

---

## Architecture

```text
api/
  authorize.ts     GET   authorize via LinkedIn OAuth (CSRF state in Redis)
  callback.ts      GET   exchange code for tokens, store, success page
  mcp.ts           POST  MCP endpoint (Streamable HTTP), bearer-auth, tools
  dashboard.ts     GET   admin dashboard API (auth status, logs)
frontend/                React + Tailwind + MUI dashboard source -> public/
lib/
  config.ts               env vars, URLs, Redis client
  linkedin-auth.ts        token exchange, refresh, access-token helper
  linkedin-api.ts         profile, create_post, create_image_post
  logging.ts              structured logs to Redis
  errors.ts               NotAuthorizedError, LinkedInError
mcp-stdio.mjs        esbuild-bundled stdio entry for local clients
mcp-stdio-entry.mjs  source entry for the bundling step
```

- Tokens are stored under the single Redis key `linkedin:tokens`.
- `/api/mcp` is stateless and requires `Authorization: Bearer <MCP_AUTH_TOKEN>` on every request.
- All LinkedIn calls use raw `fetch()`; no LinkedIn SDK.

---

## Prerequisites

- Node.js 24 or newer.
- A LinkedIn Developer app with approved scopes: `openid`, `profile`, `email`, `w_member_social`.
- An Upstash Redis database.

### Environment variables

Set these in Vercel and in a root `.env` for local development:

| Variable | Purpose |
|----------|---------|
| `LINKEDIN_CLIENT_ID` | LinkedIn app client ID |
| `LINKEDIN_CLIENT_SECRET` | LinkedIn app client secret |
| `LINKEDIN_REDIRECT_URI` | Must match a whitelisted redirect URL exactly |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token |
| `MCP_AUTH_TOKEN` | Bearer token MCP clients send to `/api/mcp` |

These files are git-ignored; never commit secrets.

---

## Local development

```bash
npm install
vercel dev          # serves http://localhost:3000/api/...
npm run typecheck   # tsc --noEmit
```

Whitelist either redirect URL in the LinkedIn Developer Portal as an Authorized Redirect URL. LinkedIn matches redirects exactly (no query params).

```env
# local (vercel dev)
LINKEDIN_REDIRECT_URI=http://localhost:3000/api/callback

# production (Vercel)
LINKEDIN_REDIRECT_URI=https://<your-app>.vercel.app/api/callback
```

Type-check and deployment:

```bash
npm run typecheck
vercel           # preview
vercel --prod    # production
```

---

## OAuth flow

1. `/api/authorize` creates a CSRF `state`, stores it in Redis (10-minute TTL), and redirects to LinkedIn.
2. LinkedIn authenticates and redirects back to `/api/callback?code=...&state=...`.
3. `/api/callback` validates `state`, exchanges the code for tokens, and saves them to Redis.
4. MCP tools call `getValidAccessToken()`, refreshing the token when near expiry and a refresh token exists, otherwise throwing `NotAuthorizedError`.

> LinkedIn issues a `refresh_token` only for apps provisioned with programmatic refresh. With the standard set scope, access tokens last 60 days and the user re-authorizes when they expire. `check_auth_status` reports the real state.

Authorize once by opening `/api/authorize` in a browser.

---

## Image upload

LinkedIn's Images API uploads asynchronously. Creating a post before the image finishes processing produces a blank feed image. This server:

1. Registers the upload and receives a signed `uploadUrl`.
2. Uploads the image bytes.
3. Polls the image status until it is `AVAILABLE`, then creates the post.

Only fully processed images are attached, so posts always render.

---

## Client setup

### Remote (Streamable HTTP)

- Type: Custom / MCP server, Streamable HTTP.
- Endpoint: `https://<your-deployed-url>/api/mcp`
- Authorization header: `Bearer <MCP_AUTH_TOKEN>`

### Local (stdio)

Point the client at the bundled entry:

```text
node /path/to/linkedin-post-mcp/mcp-stdio.mjs
```

---

## Deploy to Vercel

```bash
vercel           # preview
vercel --prod    # production
```

- `vercel.json` pins `api/**` to the Node.js 24 runtime.
- Set the production callback URL for LinkedIn.
- After deploying, open `/api/authorize`, then the tools work.

---

## Security

- Secrets come from environment variables only; nothing is logged.
- The MCP endpoint requires a bearer token before protocol handling.
- OAuth `state` guards against CSRF and is one-time-use with a short TTL.