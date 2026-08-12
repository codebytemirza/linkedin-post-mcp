import type { VercelRequest, VercelResponse } from "@vercel/node";
import { MCP_AUTH_TOKEN, redis } from "../lib/config";
import { fetchProfile } from "../lib/linkedin-api";
import { readStoredTokens } from "../lib/linkedin-auth";
import { readLogs, type LogEntry } from "../lib/logging";
import { isValidOAuthBearerToken } from "../lib/oauth";

interface DashboardPayload {
  ok: boolean;
  auth: {
    authorized: boolean;
    expiresAt?: number;
    hasRefreshToken: boolean;
    name?: string;
    email?: string;
  };
  logs: LogEntry[];
  posts: LogEntry[];
  errorCount: number;
  recentErrors: LogEntry[];
  health: {
    redis: boolean;
    linkedin: boolean;
  };
}

function respond(res: VercelResponse, payload: DashboardPayload) {
  res.setHeader("Cache-Control", "no-store");
  res.json(payload);
}

/**
 * Aggregated dashboard data for the admin UI. Protected by the same bearer
 * token as the MCP endpoint so it can read Redis safely.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  const isOAuth = token ? await isValidOAuthBearerToken(token) : false;
  const isStatic = !!(MCP_AUTH_TOKEN && token && token === MCP_AUTH_TOKEN);
  if (!isOAuth && !isStatic) {
    res.status(401).json({ error: "Unauthorized", message: "A valid Bearer token is required." });
    return;
  }

  const out: DashboardPayload = {
    ok: true,
    auth: {
      authorized: false,
      hasRefreshToken: false,
    },
    logs: [],
    posts: [],
    errorCount: 0,
    recentErrors: [],
    health: { redis: false, linkedin: false },
  };

  try {
    await redis.ping();
    out.health.redis = true;
  } catch {
    out.health.redis = false;
  }

  const logs = await readLogs(200);
  out.logs = logs;
  out.posts = logs.filter((l) => l.type === "post");
  out.errorCount = logs.filter((l) => l.level === "error").length;
  out.recentErrors = logs.filter((l) => l.level === "error").slice(0, 10);

  const stored = await readStoredTokens();
  const now = Date.now();
  if (stored?.access_token && stored.expires_at && now < stored.expires_at) {
    out.auth = {
      authorized: true,
      expiresAt: stored.expires_at,
      hasRefreshToken: !!stored.refresh_token,
    };
    try {
      const profile = await fetchProfile(stored.access_token);
      out.auth.name =
        [profile.given_name, profile.family_name].filter(Boolean).join(" ") || profile.name;
      out.auth.email = profile.email;
      out.health.linkedin = true;
    } catch {
      out.health.linkedin = false;
    }
  }

  respond(res, out);
}