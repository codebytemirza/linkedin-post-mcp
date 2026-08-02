import { randomBytes } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  LINKEDIN_AUTH_URL,
  LINKEDIN_CLIENT_ID,
  LINKEDIN_REDIRECT_URI,
  OAUTH_SCOPES,
} from "../lib/config";
import { storeOAuthState } from "../lib/linkedin-auth";

/**
 * Redirects the browser to LinkedIn's OAuth consent screen with the approved
 * scopes and a randomly generated CSRF `state` that we persist briefly so
 * /api/callback can validate it.
 */
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    if (!LINKEDIN_CLIENT_ID || !LINKEDIN_REDIRECT_URI) {
      return res.status(500).send("Server is missing LinkedIn OAuth configuration.");
    }

    const state = randomBytes(24).toString("hex");
    await storeOAuthState(state, 600);

    const params = new URLSearchParams({
      response_type: "code",
      client_id: LINKEDIN_CLIENT_ID,
      redirect_uri: LINKEDIN_REDIRECT_URI,
      scope: OAUTH_SCOPES.join(" "),
      state,
    });

    res.redirect(302, `${LINKEDIN_AUTH_URL}?${params.toString()}`);
  } catch (error) {
    res.status(500).send({ error: "Failed to start LinkedIn authorization." });
  }
}