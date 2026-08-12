import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  getClient,
  getQueryParam,
  isRedirectAllowed,
  issueAuthorizationCode,
  logOAuth,
  OAUTH_SCOPE,
  toQueryString,
  type RegisteredClient,
} from "../../lib/oauth";
import { fetchProfile } from "../../lib/linkedin-api";
import { readStoredTokens } from "../../lib/linkedin-auth";

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function redirectBack(
  res: VercelResponse,
  redirectUri: string,
  params: Record<string, string | undefined>
) {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, v);
  }
  res.redirect(302, url.toString());
}

function consentPage(params: {
  clientName: string;
  linkedName: string;
  hidden: Record<string, string>;
}): string {
  const fields = Object.entries(params.hidden)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(
      ([k, v]) =>
        `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}" />`
    )
    .join("\n        ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Authorize LinkedIn MCP</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
           background: linear-gradient(135deg, #0b66c3 0%, #004e99 100%);
           color: #fff; display: grid; place-items: center; min-height: 100vh;
           margin: 0; padding: 24px; }
    .card { background: #fff; color: #111; padding: 40px 44px; border-radius: 16px;
            max-width: 440px; width: 100%; box-shadow: 0 24px 60px rgba(0,0,0,.3); }
    .logo { width: 52px; height: 52px; background: #0a66c2; border-radius: 14px;
            display: grid; place-items: center; color: #fff; font-weight: 800;
            font-size: 22px; margin-bottom: 18px; }
    h1 { font-size: 20px; margin: 0 0 6px; }
    p { color: #444; line-height: 1.55; font-size: 14px; }
    .client { font-weight: 700; color: #0a66c2; }
    .chip { display: inline-block; background: #e7f3ff; color: #004e99; font-weight: 600;
            border-radius: 999px; padding: 5px 12px; font-size: 12px; margin-top: 10px; }
    .buttons { display: flex; gap: 12px; margin-top: 26px; }
    button { flex: 1; padding: 12px 16px; border-radius: 10px; font-weight: 700;
             font-size: 14px; cursor: pointer; border: none; }
    .approve { background: #0a66c2; color: #fff; }
    .approve:hover { background: #004e99; }
    .deny { background: #f1f3f5; color: #333; }
    .deny:hover { background: #e2e6ea; }
    .muted { color: #888; font-size: 12px; margin-top: 18px; line-height: 1.4; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">in</div>
    <h1>Authorize <span class="client">${escapeHtml(params.clientName)}</span></h1>
    <p>
      ${escapeHtml(params.clientName)} wants permission to publish to your
      LinkedIn account${params.linkedName ? ` for <b>${escapeHtml(params.linkedName)}</b>` : ""}.
      It can create text posts, image posts, read your profile, and check your
      authorization status.
    </p>
    <span class="chip">linkedin-poster · scope: ${escapeHtml(OAUTH_SCOPE)}</span>
    <form method="post" action="./authorize">
      ${fields}
      <div class="buttons">
        <button type="submit" name="consent" value="approve" class="approve">Allow &amp; connect</button>
        <button type="submit" name="consent" value="deny" class="deny">Deny</button>
      </div>
    </form>
    <p class="muted">
      By allowing, you authorize this client to act on your LinkedIn account
      for 30 days unless you revoke it.
    </p>
  </div>
</body>
</html>`;
}

function errorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><title>Authorization error</title></head>
<body style="font-family:system-ui,sans-serif;background:#f6f8fa;display:grid;place-items:center;min-height:100vh;margin:0">
  <div style="background:#fff;padding:36px;border-radius:14px;max-width:480px;border-top:4px solid #d93025;color:#111">
    <h1 style="font-size:18px;margin:0 0 8px">LinkedIn MCP — authorization error</h1>
    <p style="color:#444;line-height:1.5">${escapeHtml(message)}</p>
  </div>
</body>
</html>`;
}

async function linkedInDisplayName(): Promise<string> {
  try {
    const stored = await readStoredTokens();
    if (stored?.access_token && stored.expires_at && stored.expires_at > Date.now()) {
      const profile = await fetchProfile(stored.access_token);
      return (
        [profile.given_name, profile.family_name].filter(Boolean).join(" ") ||
        profile.name ||
        ""
      );
    }
  } catch {
    // Leave blank when we can't confirm the LinkedIn identity yet.
  }
  return "";
}

/**
 * OAuth authorization endpoint. GET renders a consent screen; POST (from the
 * consent form) validates the request and, on approval, issues a single-use
 * authorization code and redirects back to the client with ?code&state.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const state = getQueryParam(req.query.state);

  function fail(message: string) {
    res.status(400).setHeader("Content-Type", "text/html");
    res.send(errorPage(message));
  }

  if (req.method === "GET") {
    const responseType = getQueryParam(req.query.response_type);
    const clientId = getQueryParam(req.query.client_id);
    const redirectUri = getQueryParam(req.query.redirect_uri);
    const codeChallenge = getQueryParam(req.query.code_challenge);
    const codeChallengeMethod = getQueryParam(req.query.code_challenge_method) ?? "S256";

    if (responseType !== "code") return fail("response_type must be 'code'.");
    const client = await getClient(clientId);
    if (!client)
      return fail(
        "Unknown client. If you filled in an OAuth Client ID, make sure it matches the server's MCP_OAUTH_CLIENT_ID."
      );
    if (!redirectUri || !isRedirectAllowed(client, redirectUri))
      return fail("The redirect_uri is not allowed for this client.");
    if (!codeChallenge) return fail("A PKCE code_challenge is required.");
    if (codeChallengeMethod !== "S256")
      return fail("Only the 'S256' PKCE code_challenge_method is supported.");

    const linkedName = await linkedInDisplayName();
    res.setHeader("Content-Type", "text/html");
    res.send(
      consentPage({
        clientName: client.client_name ?? client.client_id,
        linkedName,
        hidden: {
          response_type: "code",
          client_id: client.client_id,
          redirect_uri: redirectUri,
          code_challenge: codeChallenge,
          code_challenge_method: codeChallengeMethod,
          scope: getQueryParam(req.query.scope) ?? OAUTH_SCOPE,
          state: state ?? "",
        },
      })
    );
    return;
  }

  if (req.method === "POST") {
    const form = new URLSearchParams(toQueryString(req));
    const consent = form.get("consent");
    const clientId = form.get("client_id") ?? getQueryParam(req.query.client_id) ?? "";
    const redirectUri =
      form.get("redirect_uri") ?? getQueryParam(req.query.redirect_uri) ?? "";
    const codeChallenge =
      form.get("code_challenge") ?? getQueryParam(req.query.code_challenge) ?? "";
    const codeChallengeMethod =
      form.get("code_challenge_method") ?? getQueryParam(req.query.code_challenge_method) ?? "S256";
    const scope = form.get("scope") ?? getQueryParam(req.query.scope) ?? OAUTH_SCOPE;
    const postState = form.get("state") ?? state;

    const client: RegisteredClient | null = await getClient(clientId);
    if (!client || !redirectUri || !isRedirectAllowed(client, redirectUri))
      return fail("Invalid authorization request.");

    if (consent === "deny") {
      return redirectBack(res, redirectUri, { error: "access_denied", state: postState });
    }
    if (consent !== "approve") return fail("You must explicitly approve the request.");
    if (!codeChallenge) return fail("A PKCE code_challenge is required.");
    if (codeChallengeMethod !== "S256")
      return fail("Only the 'S256' PKCE code_challenge_method is supported.");

    const code = await issueAuthorizationCode({
      client_id: client.client_id,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
      scope,
    });
    await logOAuth("authorize", `consent granted for ${client.client_name ?? client.client_id}`);
    return redirectBack(res, redirectUri, { code, state: postState });
  }

  res.status(405).json({ error: "method_not_allowed", error_description: "GET or POST required." });
}