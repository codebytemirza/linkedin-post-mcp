# MCP LinkedIn Poster

A production-ready [Model Context Protocol](https://modelcontextprotocol.io) server that lets Claude create LinkedIn posts on your behalf via natural language. Built as plain **Vercel serverless functions** (no framework) using the MCP TypeScript SDK v2 with **Streamable HTTP** transport, **Upstash Redis** for token storage, and instanceof-only OAuth 2.0 against LinkedIn.

## Architecture

```
api/
  authorize.ts   GET  -> redirects browser to LinkedIn OAuth consent screen (CSRF `state` saved in Redis)
  callback.ts    GET  -> validates state, exchanges code for access+refresh token, stores tokens, shows success page
  mcp.ts         POST -> the MCP endpoint (Streamable HTTP) with bearer-auth + 3 tools
lib/
  config.ts            env vars, URLs, Redis client (per the Upstash skill: `Redis.fromEnv()`)
  linkedin-auth.ts     getValidAccessToken(), exchangeCodeForToken(), refresh, CSRF state helpers
  linkedin-api.ts      fetchProfile() (userinfo), createLinkedInPost() (Posts API)
```

- Tokens live under the single fixed Redis key `linkedin:tokens`.
- The MCP endpoint (stateless core model) requires `Authorization: Bearer <MCP_AUTH_TOKEN>` on **every** request.
- All LinkedIn calls use raw `fetch()`. No LinkedIn SDK.

### MCP tools

| Tool | Input | Returns |
|------|-------|---------|
| `create_post` | `text`, optional `visibility` (`PUBLIC`/`CONNECTIONS`) | created post ID |
| `get_profile` | — | name + email |
| `check_auth_status` | — | whether tokens exist, valid, and expiry times |

## Prerequisites

- Node.js **20+**
- A linked LinkedIn Developer app with the products enabling these **approved scopes**:
  `openid`, `profile`, `email`, `w_member_social`
- Upstash Redis database

### Environment variables (`.env.local` for Vercel)

| Variable | Purpose |
|----------|---------|
| `LINKEDIN_CLIENT_ID` | LinkedIn app Client ID |
| `LINKEDIN_CLIENT_SECRET` | LinkedIn app Client Secret |
| `LINKEDIN_REDIRECT_URI` | Must match a whitelisted redirect URL exactly |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token |
| `MCP_AUTH_TOKEN` | Bearer token Claude sends to `/api/mcp` |

> Never commit these. They are already set as Vercel environment variables.

## Local development

The project is plain Vercel Functions (no framework), so `vercel dev` serves the
`/api/*` endpoints directly; there is **no** `dev` npm script (adding one that
calls `vercel dev` makes Vercel refuse with a recursion error). Node is pinned to
20 via `package.json` → `engines`.

```bash
npm install        # already-installed deps are used
vercel dev         # serves http://localhost:3000/api/...
npm run typecheck  # tsc --noEmit
```

Env vars for local dev are read from a root `.env` file (see the `.env` you create
from `.env.example` / your existing `.env.local` values).

For local OAuth to work, the LinkedIn app must whitelist the local callback URL and your `LINKEDIN_REDIRECT_URI` must match it exactly:

```env
# local (vercel dev)
LINKEDIN_REDIRECT_URI=http://localhost:3000/api/callback

# production (Vercel)
LINKEDIN_REDIRECT_URI=https://post-mcp.vercel.app/api/callback
```

Add whichever URL you use to the **Authorized redirect URLs** list in the
[LinkedIn Developer Portal](https://www.linkedin.com/developers/apps) — LinkedIn only
talks to URLs it trusts, and matching is exact (no query params, no `#`).

Type-check build / deployment is handled by `vercel build` (no framework build step):

```bash
vercel dev         # run locally (functions served directly)
vercel             # preview
vercel --prod      # production
```

## How the OAuth flow works end to end

1. **`/api/authorize`** — generates a random CSRF `state`, saves it to Redis (`PENDING_STATE_KEY`, 10-min TTL), and 302-redirects your browser to
   `https://www.linkedin.com/oauth/v2/authorization` with `response_type=code`, `client_id`, `redirect_uri`, and `scope=openid profile email w_member_social`.
2. **LinkedIn** authenticates you and redirects back to `/api/callback?code=…&state=…`.
3. **`/api/callback`** — validates `state` against Redis (and clears it), then `POST https://www.linkedin.com/oauth/v2/accessToken` with `grant_type=authorization_code`. It persists `access_token`, `expires_in`, `refresh_token`, `refresh_token_expires_in` to `linkedin:tokens` and shows a success page.
4. **MCP tools** — `getValidAccessToken()` reads `linkedin:tokens`; if the access token is expired (or within 5 min) **and a refresh token exists**, it `POST`s to the same token endpoint with `grant_type=refresh_token` to mint a new one and updates Redis. It throws `NotAuthorizedError` if no tokens exist.

> Note: LinkedIn only issues `refresh_token` when your app is provisioned for *programmatic refresh tokens* ("limited set of partners"). With the standard consumer `openid/profile/email/w_member_social` set, LinkedIn returns no refresh token, so access tokens last 60 days and the user re-authorizes when they expire. `check_auth_status` reports the real state either way.

### Trigger authorization once

Open the authorize URL in a browser **once** to connect the account:

```
https://post-mcp.vercel.app/api/authorize
```

## Add as a custom connector in Claude (`claude.ai` → Settings → Connectors → MCP)

- **Type:** Custom / MCP server (Streamable HTTP)
- **Endpoint (URL):** `https://post-mcp.vercel.app/api/mcp`
- **Authentication → Authorization header:** `Bearer <MCP_AUTH_TOKEN>`

Set `MCP_AUTH_TOKEN` to the same value that is configured on the server.

## Deploy to Vercel

With `vercel` CLI installed and logged in:

```bash
vercel           # preview
vercel --prod    # production
```

- `vercel.json` pins the `api/**` functions to the **Node.js 20** runtime.
- `LINKEDIN_REDIRECT_URI` must be `https://post-mcp.vercel.app/api/callback` (and whitelisted in LinkedIn).
- After deploying, run `/api/authorize` once, then the tools work.

## Security notes

- Secrets are only ever read from environment variables; nothing is logged.
- Every `/api/mcp` request requires the bearer token before any protocol handling.
- OAuth `state` prevents CSRF; it is stored with a short TTL and consumed (deleted) on use.