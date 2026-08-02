import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  consumeOAuthState,
  exchangeCodeForToken,
} from "../lib/linkedin-auth";
import { logEvent } from "../lib/logging";

const SUCCESS_HTML = (name: string) => `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>LinkedIn Connected</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
             background: #0b66c3; color: #fff; display: grid; place-items: center;
             min-height: 100vh; margin: 0; text-align: center; }
      .card { background: #fff; color: #111; padding: 40px 48px; border-radius: 12px;
              max-width: 460px; box-shadow: 0 20px 50px rgba(0,0,0,.25); }
      h1 { font-size: 22px; margin: 0 0 8px; }
      p { color: #444; line-height: 1.5; }
      .badge { display: inline-block; background: #e7f3e8; color: #1d7a2f;
               font-weight: 600; border-radius: 999px; padding: 6px 14px; margin-top: 8px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>LinkedIn connected ✓</h1>
      <p>Your LinkedIn account${name ? ` (${name})` : ""} is now authorized.
         You can close this tab and use the MCP tools in your client.</p>
      <span class="badge">ready to post</span>
    </div>
  </body>
</html>`;

const ERROR_HTML = (message: string) => `
<!DOCTYPE html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Authorization failed</title>
    <style>
      body { font-family: system-ui, sans-serif; background: #f7f7f7; color: #111;
             display: grid; place-items: center; min-height: 100vh; margin: 0; }
      .card { background: #fff; padding: 32px 40px; border-radius: 12px; max-width: 460px;
              box-shadow: 0 10px 30px rgba(0,0,0,.08); border-top: 4px solid #d9534f; }
      h1 { font-size: 20px; margin: 0 0 8px; } p { color: #444; word-break: break-word; }
    </style>
  </head>
  <body><div class="card"><h1>Authorization failed</h1><p>${message}</p></div></body>
</html>`;

/**
 * Receives the authorization `code` + `state` from LinkedIn after the user
 * approves, validates the CSRF state, exchanges the code for an access +
 * refresh token, stores them under "linkedin:tokens", and shows a success page.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { code, state, error, error_description } = req.query;

  if (error) {
    res.status(400).setHeader("Content-Type", "text/html");
    return res.send(ERROR_HTML(`LinkedIn reported an error: ${error}${error_description ? ` — ${error_description}` : ""}.`));
  }

  if (!code || typeof code !== "string") {
    res.status(400).setHeader("Content-Type", "text/html");
    return res.send(ERROR_HTML("Missing authorization code from LinkedIn."));
  }

  if (!state || typeof state !== "string" || !(await consumeOAuthState(state))) {
    res.status(401).setHeader("Content-Type", "text/html");
    return res.send(ERROR_HTML("State validation failed. This may be a cross-site request forgery attempt — please restart authorization."));
  }

  try {
    await exchangeCodeForToken(code);
    res.setHeader("Content-Type", "text/html");
    res.send(SUCCESS_HTML(""));
  } catch (err) {
    void logEvent("error", "error", "authorize", {
      detail: err instanceof Error ? err.message.slice(0, 300) : "Token exchange failed",
    });
    res.status(500).setHeader("Content-Type", "text/html");
    res.send(ERROR_HTML(err instanceof Error ? err.message : "Token exchange failed."));
  }
}