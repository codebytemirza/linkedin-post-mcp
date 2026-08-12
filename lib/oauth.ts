import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { redis } from "./config";
import { logEvent } from "./logging";

/**
 * Minimal OAuth 2.1 authorization server used by Claude's "custom connector".
 *
 * Implements the endpoints the MCP authorization server spec requires so that
 * Claude can discover this server (/.well-known/oauth-authorization-server),
 * authorize (PKCE, response_type=code), exchange a code, refresh tokens, and
 * revoke them. Access tokens it issues are accepted by /api/mcp and
 * /api/dashboard in place of the legacy MCP_AUTH_TOKEN header.
 *
 * All state lives in Upstash Redis, keyed under "mcp:oauth:*".
 */

export const OAUTH_SCOPE = "mcp";
export const ACCESS_TTL_SECONDS = 60 * 60; // 1 hour
export const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const CODE_TTL_SECONDS = 10 * 60; // 10 minutes
export const CLIENT_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year

export const CLIENT_KEY_PREFIX = "mcp:oauth:clients:";
export const CODE_KEY_PREFIX = "mcp:oauth:code:";
export const ACCESS_KEY_PREFIX = "mcp:oauth:access:";
export const REFRESH_KEY_PREFIX = "mcp:oauth:refresh:";

// Pepper used to hash client secrets. Falls back to the existing MCP token so
// no new env var is strictly required.
const PEPPER = process.env.MCP_OAUTH_SECRET ?? process.env.MCP_AUTH_TOKEN ?? "mcp-post";

export type TokenAuthMethod = "none" | "client_secret_post" | "client_secret_basic";

export interface RegisteredClient {
  client_id: string;
  client_secret_hash?: string;
  client_name?: string;
  redirect_uris: string[];
  token_endpoint_auth_method: TokenAuthMethod;
  grant_types: string[];
  response_types: string[];
}

export interface AuthorizationCodePayload {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  scope: string;
}

export interface TokenRecord {
  client_id: string;
  scope: string;
  issued_at: number;
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function secureEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(`${PEPPER}:${secret}`).digest("hex");
}

/** Derives the public base URL of this deployment (works in vercel dev too). */
export function getBaseUrl(req: VercelRequest): string {
  const proto = (req.headers["x-forwarded-proto"] ?? "https").toString().split(",")[0].trim();
  const host = (
    req.headers["x-forwarded-host"] ??
    req.headers.host ??
    "post-mcp.vercel.app"
  )
    .toString()
    .split(",")[0]
    .trim();
  return `${proto}://${host}`;
}

/** Query values from @vercel/node may be string or string[]. */
export function getQueryParam(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

/** Turn req.body (string, Buffer, or parsed object) into a query-string form. */
export function toQueryString(req: VercelRequest): string {
  const body = req.body;
  if (typeof body === "string") return body;
  if (Buffer.isBuffer(body)) return body.toString("utf8");
  if (body && typeof body === "object") {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      if (v !== undefined && v !== null) params.set(k, String(v));
    }
    return params.toString();
  }
  return "";
}

function isLoopback(uri: string): boolean {
  try {
    const host = new URL(uri).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

/**
 * Redirect URIs are matched exactly against the client's registered list.
 * Loopback redirects (Claude Desktop's local callback) are always allowed, and
 * the statically configured env client may redirect to any https URL because
 * the operator chose to trust it.
 */
export function isRedirectAllowed(client: RegisteredClient, redirectUri: string): boolean {
  if (isLoopback(redirectUri)) return true;
  for (const allowed of client.redirect_uris) {
    if (allowed === "*") return true;
    if (allowed === redirectUri) return true;
    if (allowed.endsWith("*") && redirectUri.startsWith(allowed.slice(0, -1))) return true;
  }
  return false;
}

/**
 * Resolves a client_id to a registered client. A static client can be
 * configured via MCP_OAUTH_CLIENT_ID (+ MCP_OAUTH_CLIENT_SECRET) so users can
 * paste those into Claude's "Advanced settings".
 */
export async function getClient(clientId: string | undefined): Promise<RegisteredClient | null> {
  if (!clientId) return null;
  const stored = await redis.get<RegisteredClient>(`${CLIENT_KEY_PREFIX}${clientId}`);
  if (stored) return stored;

  const staticId = process.env.MCP_OAUTH_CLIENT_ID;
  const staticSecret = process.env.MCP_OAUTH_CLIENT_SECRET;
  if (staticId && clientId === staticId) {
    return {
      client_id: staticId,
      client_secret_hash: staticSecret ? hashSecret(staticSecret) : undefined,
      client_name: process.env.MCP_OAUTH_CLIENT_NAME ?? "LinkedIn MCP",
      redirect_uris: ["https://*"],
      token_endpoint_auth_method: staticSecret ? "client_secret_post" : "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    };
  }
  return null;
}

export function verifyClientSecret(client: RegisteredClient, secret: string | undefined): boolean {
  if (!secret || !client.client_secret_hash) return false;
  return secureEquals(hashSecret(secret), client.client_secret_hash);
}

/**
 * Authenticates a confidential client on the token endpoint. Supports
 * client_secret_post (form body) and client_secret_basic (Authorization
 * header), matching either regardless of the stored preference for robustness.
 */
export function authenticateClient(
  client: RegisteredClient,
  body: URLSearchParams,
  authHeader: string
): boolean {
  if (client.token_endpoint_auth_method === "none" && !client.client_secret_hash) return true;

  const basic = /^Basic\s+(.+)$/i.exec(authHeader);
  if (basic) {
    const decoded = Buffer.from(basic[1], "base64").toString("utf8");
    const idx = decoded.indexOf(":");
    if (idx !== -1 && decoded.slice(0, idx) === client.client_id) {
      if (verifyClientSecret(client, decoded.slice(idx + 1))) return true;
    }
  }

  return verifyClientSecret(client, body.get("client_secret") ?? undefined);
}

export interface DynamicClientInput {
  redirect_uris?: string[];
  client_name?: string;
  token_endpoint_auth_method?: string;
  grant_types?: string[];
  response_types?: string[];
}

/** RFC 7591 dynamic client registration. Returns the client plus its raw secret. */
export async function createDynamicClient(
  input: DynamicClientInput
): Promise<RegisteredClient & { client_secret?: string }> {
  const clientId = randomBytes(16).toString("hex");

  let authMethod: TokenAuthMethod = "none";
  if (
    input.token_endpoint_auth_method === "client_secret_post" ||
    input.token_endpoint_auth_method === "client_secret_basic"
  ) {
    authMethod = input.token_endpoint_auth_method;
  }

  let secret: string | undefined;
  let secretHash: string | undefined;
  if (authMethod !== "none") {
    secret = randomBytes(32).toString("base64url");
    secretHash = hashSecret(secret);
  }

  const client: RegisteredClient = {
    client_id: clientId,
    client_secret_hash: secretHash,
    client_name: input.client_name ?? "Unknown client",
    redirect_uris: (input.redirect_uris ?? []).filter((u) => typeof u === "string"),
    token_endpoint_auth_method: authMethod,
    grant_types: input.grant_types?.length
      ? input.grant_types
      : ["authorization_code", "refresh_token"],
    response_types: input.response_types?.length ? input.response_types : ["code"],
  };

  await redis.set(`${CLIENT_KEY_PREFIX}${clientId}`, client, { ex: CLIENT_TTL_SECONDS });

  const out: RegisteredClient & { client_secret?: string } = { ...client };
  if (secret) out.client_secret = secret;
  return out;
}

/** RFC 7636 PKCE verification (S256 only, as the MCP spec requires). */
export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  if (!codeVerifier || !codeChallenge) return false;
  const digest = createHash("sha256").update(codeVerifier).digest();
  const challenge = base64UrlEncode(digest);
  return secureEquals(challenge, codeChallenge);
}

export async function issueAuthorizationCode(
  payload: AuthorizationCodePayload
): Promise<string> {
  const code = randomBytes(24).toString("base64url");
  await redis.set(`${CODE_KEY_PREFIX}${code}`, payload, { ex: CODE_TTL_SECONDS });
  return code;
}

/** Reads and single-use-consumes an authorization code. */
export async function consumeAuthorizationCode(
  code: string
): Promise<AuthorizationCodePayload | null> {
  const payload = await redis.get<AuthorizationCodePayload>(`${CODE_KEY_PREFIX}${code}`);
  if (payload) await redis.del(`${CODE_KEY_PREFIX}${code}`);
  return payload;
}

export interface IssuedTokens {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
}

export async function issueTokens(clientId: string): Promise<IssuedTokens> {
  const accessToken = randomBytes(32).toString("base64url");
  const refreshToken = randomBytes(32).toString("base64url");
  const now = Date.now();
  const record: TokenRecord = { client_id: clientId, scope: OAUTH_SCOPE, issued_at: now };
  await redis.set(`${ACCESS_KEY_PREFIX}${accessToken}`, record, { ex: ACCESS_TTL_SECONDS });
  await redis.set(`${REFRESH_KEY_PREFIX}${refreshToken}`, record, { ex: REFRESH_TTL_SECONDS });
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "Bearer",
    expires_in: ACCESS_TTL_SECONDS,
    scope: OAUTH_SCOPE,
  };
}

/** True when the string is a live access token issued by this server. */
export async function isValidOAuthBearerToken(token: string): Promise<boolean> {
  try {
    const record = await redis.get<TokenRecord>(`${ACCESS_KEY_PREFIX}${token}`);
    return !!record;
  } catch {
    return false;
  }
}

/** Revokes an access or refresh token. Never throws. */
export async function revokeToken(token: string): Promise<boolean> {
  try {
    const access = await redis.get(`${ACCESS_KEY_PREFIX}${token}`);
    const refresh = await redis.get(`${REFRESH_KEY_PREFIX}${token}`);
    if (!access && !refresh) return false;
    await redis.del(`${ACCESS_KEY_PREFIX}${token}`);
    await redis.del(`${REFRESH_KEY_PREFIX}${token}`);
    return true;
  } catch {
    return false;
  }
}

/** Convenience so routes can fire-and-forget structured events. */
export async function logOAuth(type: "register" | "authorize" | "token" | "revoke", detail: string) {
  await logEvent("auth", "success", `oauth_${type}`, { detail });
}