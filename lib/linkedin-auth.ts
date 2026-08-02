import {
  LINKEDIN_CLIENT_ID,
  LINKEDIN_CLIENT_SECRET,
  LINKEDIN_REDIRECT_URI,
  LINKEDIN_TOKEN_URL,
  PENDING_STATE_KEY,
  TOKEN_CACHE_KEY,
  redis,
} from "./config";
import { ConfigError, LinkedInError, NotAuthorizedError } from "./errors";
import { logEvent } from "./logging";

/**
 * Shape of the token bundle we persist under the fixed "linkedin:tokens" key.
 * All timestamps are epoch milliseconds.
 */
export interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // access token expiry
  refresh_token_expires_at: number; // refresh token expiry
  scope?: string;
}

interface OAuthTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_token_expires_in: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

function requireEnv() {
  if (!LINKEDIN_CLIENT_ID || !LINKEDIN_CLIENT_SECRET || !LINKEDIN_REDIRECT_URI) {
    throw new ConfigError("LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, LINKEDIN_REDIRECT_URI");
  }
}

/** Reads the stored token bundle, or null when none exist. */
export async function readStoredTokens(): Promise<StoredTokens | null> {
  return redis.get<StoredTokens>(TOKEN_CACHE_KEY);
}

function storeTokens(parsed: OAuthTokenResponse, now = Date.now()): StoredTokens {
  const tokens: StoredTokens = {
    access_token: parsed.access_token,
    refresh_token: parsed.refresh_token,
    // expires_in is seconds; refresh_token_expires_in may be absent (LinkedIn
    // only issues refresh tokens when programmatic refresh is provisioned).
    expires_at: now + Number(parsed.expires_in ?? 0) * 1000,
    refresh_token_expires_at: parsed.refresh_token_expires_in
      ? now + Number(parsed.refresh_token_expires_in) * 1000
      : 0, // 0 = refresh expiry unknown / not provided
    scope: parsed.scope,
  };
  // Upstash automatically serializes the plain object.
  return tokens;
}

/**
 * Exchanges an OAuth authorization code for an access + refresh token bundle
 * and persists it. Used by /api/callback.
 */
export async function exchangeCodeForToken(code: string): Promise<StoredTokens> {
  requireEnv();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: LINKEDIN_CLIENT_ID,
    client_secret: LINKEDIN_CLIENT_SECRET,
    redirect_uri: LINKEDIN_REDIRECT_URI,
  });

  const res = await fetch(LINKEDIN_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const parsed = (await res.json()) as OAuthTokenResponse;

  if (!res.ok) {
    throw new LinkedInError(
      res.status,
      `LinkedIn token exchange failed: ${parsed.error ?? "request_error"} - ${parsed.error_description ?? res.statusText}`,
      parsed.error
    );
  }

  const tokens = await storeTokens(parsed, Date.now());
  await redis.set(TOKEN_CACHE_KEY, tokens);
  await logEvent("auth", "success", "token_exchange", { detail: "LinkedIn OAuth authorization completed" });
  return tokens;
}

/** Refreshes the stored refresh token for a new access token. */
async function refreshAccessToken(): Promise<StoredTokens> {
  const stored = await readStoredTokens();
  if (!stored?.refresh_token) throw new NotAuthorizedError();

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: stored.refresh_token,
    client_id: LINKEDIN_CLIENT_ID,
    client_secret: LINKEDIN_CLIENT_SECRET,
  });

  const res = await fetch(LINKEDIN_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const parsed = (await res.json()) as OAuthTokenResponse;

  if (!res.ok) {
    throw new LinkedInError(
      res.status,
      `Token refresh failed: ${parsed.error ?? "request_error"} - ${parsed.error_description ?? res.statusText}`,
      parsed.error
    );
  }

  // Preserve a refresh token if the response omits one.
  const merged: OAuthTokenResponse = {
    ...parsed,
    refresh_token: parsed.refresh_token || stored.refresh_token,
  };
  const tokens = await storeTokens(merged, Date.now());
  await redis.set(TOKEN_CACHE_KEY, tokens);
  return tokens;
}

/**
 * Returns a valid LinkedIn access token, transparently refreshing it when it
 * is expired or will expire within the next 5 minutes.
 *
 * Throws NotAuthorizedError when no tokens exist (user hasn't authorized).
 */
export async function getValidAccessToken(): Promise<string> {
  const stored = await readStoredTokens();
  if (!stored?.access_token) throw new NotAuthorizedError();

  const fiveMinutesMs = 5 * 60 * 1000;
  const expiringSoon = stored.expires_at && Date.now() >= stored.expires_at - fiveMinutesMs;

  if (expiringSoon) {
    const refreshed = await refreshAccessToken();
    return refreshed.access_token;
  }

  return stored.access_token;
}

/** Stores the CSRF state for the in-progress OAuth flow, ttlSeconds validity. */
export async function storeOAuthState(state: string, ttlSeconds = 600): Promise<void> {
  await redis.set(PENDING_STATE_KEY, state, { ex: ttlSeconds });
}

/** Validates the echoed state, returning true when it matches, and always clears it. */
export async function consumeOAuthState(state: string): Promise<boolean> {
  const expected = await redis.get<string>(PENDING_STATE_KEY);
  await redis.del(PENDING_STATE_KEY);
  return !!expected && expected === state;
}