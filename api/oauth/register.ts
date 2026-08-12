import { randomBytes } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { redis } from "../../lib/config";
import { createDynamicClient, getBaseUrl, logOAuth } from "../../lib/oauth";

/**
 * RFC 7591 dynamic client registration, used by Claude when no OAuth Client
 * ID/Secret is supplied in Advanced settings. Returns the client credentials
 * Claude then reuses for the authorization_code flow.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "invalid_request", error_description: "POST required." });
    return;
  }

  let body: Record<string, unknown> = {};
  try {
    if (typeof req.body === "string") body = JSON.parse(req.body);
    else if (Buffer.isBuffer(req.body)) body = JSON.parse(req.body.toString("utf8"));
    else if (req.body && typeof req.body === "object") body = req.body as Record<string, unknown>;
  } catch {
    res.status(400).json({ error: "invalid_request", error_description: "Invalid JSON body." });
    return;
  }

  const client = await createDynamicClient({
    redirect_uris: Array.isArray(body.redirect_uris)
      ? body.redirect_uris.filter((u): u is string => typeof u === "string")
      : undefined,
    client_name: typeof body.client_name === "string" ? body.client_name : undefined,
    token_endpoint_auth_method:
      typeof body.token_endpoint_auth_method === "string"
        ? body.token_endpoint_auth_method
        : undefined,
    grant_types: Array.isArray(body.grant_types)
      ? body.grant_types.filter((u): u is string => typeof u === "string")
      : undefined,
    response_types: Array.isArray(body.response_types)
      ? body.response_types.filter((u): u is string => typeof u === "string")
      : undefined,
  });

  const base = getBaseUrl(req);
  const registrationAccessToken = randomBytes(16).toString("hex");
  await redis.set(`mcp:oauth:reg:${registrationAccessToken}`, client.client_id, { ex: 3600 });
  await logOAuth("register", `registered client ${client.client_id}`);

  res.status(201).setHeader("Cache-Control", "no-store");
  res.json({
    client_id: client.client_id,
    client_secret: client.client_secret,
    client_secret_expires_at: 0,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: client.client_name,
    redirect_uris: client.redirect_uris,
    token_endpoint_auth_method: client.token_endpoint_auth_method,
    grant_types: client.grant_types,
    response_types: client.response_types,
    registration_access_token: registrationAccessToken,
    registration_client_uri: `${base}/oauth/register`,
  });
}