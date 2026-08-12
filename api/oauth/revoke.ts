import type { VercelRequest, VercelResponse } from "@vercel/node";
import { logOAuth, revokeToken, toQueryString } from "../../lib/oauth";

/**
 * OAuth token revocation (RFC 7009). Always returns 200 for the client's own
 * token per the spec; unknown/expired tokens are silently treated as revoked.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "invalid_request", error_description: "POST required." });
    return;
  }

  const params = new URLSearchParams(toQueryString(req));
  const token = params.get("token");
  if (!token) {
    res.status(400).json({ error: "invalid_request", error_description: "Missing token parameter." });
    return;
  }

  const found = await revokeToken(token);
  await logOAuth("revoke", found ? "token revoked" : "token already revoked or expired");
  res.status(200).setHeader("Cache-Control", "no-store");
  res.json({});
}