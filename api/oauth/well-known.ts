import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBaseUrl, OAUTH_SCOPE } from "../../lib/oauth";

/**
 * OAuth 2.1 authorization server metadata (RFC 8414) served at
 * /.well-known/oauth-authorization-server. Claude's custom connector performs
 * discovery here before starting the authorization flow.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const base = getBaseUrl(req);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    revocation_endpoint: `${base}/oauth/revoke`,
    registration_endpoint: `${base}/oauth/register`,
    scopes_supported: [OAUTH_SCOPE],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    response_modes_supported: ["query"],
    token_endpoint_auth_methods_supported: [
      "none",
      "client_secret_post",
      "client_secret_basic",
    ],
    revocation_endpoint_auth_methods_supported: [
      "none",
      "client_secret_post",
      "client_secret_basic",
    ],
    code_challenge_methods_supported: ["S256"],
  });
}