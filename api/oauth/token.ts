import type { VercelRequest, VercelResponse } from "@vercel/node";
import { redis } from "../../lib/config";
import {
  authenticateClient,
  consumeAuthorizationCode,
  getClient,
  issueTokens,
  logOAuth,
  REFRESH_KEY_PREFIX,
  toQueryString,
  verifyPkce,
} from "../../lib/oauth";

function tokenError(res: VercelResponse, status: number, error: string, description: string) {
  res.status(status).setHeader("Cache-Control", "no-store");
  res.json({ error, error_description: description });
}

/**
 * OAuth token endpoint (RFC 6749 §4.1.3). Supports the authorization_code and
 * refresh_token grants required by the MCP authorization spec.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "invalid_request", error_description: "POST required." });
    return;
  }

  const params = new URLSearchParams(toQueryString(req));
  const grantType = params.get("grant_type");
  const authHeader = req.headers.authorization ?? "";

  if (grantType === "authorization_code") {
    const code = params.get("code");
    const client = await getClient(params.get("client_id") ?? "");
    if (!client) return tokenError(res, 401, "invalid_client", "Unknown client_id.");
    if (!authenticateClient(client, params, authHeader))
      return tokenError(
        res,
        401,
        "invalid_client",
        "Client authentication failed. Check the OAuth Client Secret."
      );

    const record = code ? await consumeAuthorizationCode(code) : null;
    if (!record) return tokenError(res, 400, "invalid_grant", "Invalid or expired authorization code.");

    if (record.client_id !== client.client_id) {
      return tokenError(res, 400, "invalid_grant", "Authorization code was issued to another client.");
    }

    const redirectUri = params.get("redirect_uri");
    if (redirectUri && record.redirect_uri !== redirectUri) {
      return tokenError(res, 400, "invalid_grant", "redirect_uri does not match the authorization request.");
    }

    if (!verifyPkce(params.get("code_verifier") ?? "", record.code_challenge)) {
      return tokenError(
        res,
        400,
        "invalid_grant",
        "PKCE code_verifier verification failed. Use the same code_verifier you submitted as code_challenge (S256)."
      );
    }

    const issued = await issueTokens(client.client_id);
    await logOAuth("token", "authorization_code exchange succeeded");
    res.setHeader("Cache-Control", "no-store");
    return res.json(issued);
  }

  if (grantType === "refresh_token") {
    const refreshToken = params.get("refresh_token");
    const client = await getClient(params.get("client_id") ?? "");
    if (!client) return tokenError(res, 401, "invalid_client", "Unknown client_id.");
    if (!authenticateClient(client, params, authHeader))
      return tokenError(res, 401, "invalid_client", "Client authentication failed.");

    if (!refreshToken) return tokenError(res, 400, "invalid_grant", "Missing refresh_token.");

    const record = await redis.get<{ client_id: string; scope: string; issued_at: number }>(
      `${REFRESH_KEY_PREFIX}${refreshToken}`
    );
    if (!record || record.client_id !== client.client_id) {
      return tokenError(res, 400, "invalid_grant", "Invalid refresh_token.");
    }

    await redis.del(`${REFRESH_KEY_PREFIX}${refreshToken}`);
    const issued = await issueTokens(client.client_id);
    await logOAuth("token", "refresh_token exchange succeeded");
    res.setHeader("Cache-Control", "no-store");
    return res.json(issued);
  }

  return tokenError(
    res,
    400,
    "unsupported_grant_type",
    "grant_type must be authorization_code or refresh_token."
  );
}