import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { MCP_AUTH_TOKEN } from "../lib/config";
import { isValidOAuthBearerToken } from "../lib/oauth";
import { createLinkedInServer } from "../lib/server";

/**
 * Stateless MCP core: one factory per request, served over Streamable HTTP.
 * All tools live in lib/server.ts and are shared with the stdio entry.
 */
const handler = createMcpHandler(() => createLinkedInServer(), { legacy: "stateless" });
const nodeHandler = toNodeHandler(handler);

/**
 * Vercel serverless function at /api/mcp. Every request needs a Bearer token:
 * either an OAuth access token issued by this server (Claude custom
 * connector flow) or the legacy MCP_AUTH_TOKEN static token.
 */
export default async function handlerFn(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    res.status(401).setHeader("WWW-Authenticate", 'Bearer');
    res.json({ error: "Unauthorized", message: "A valid Bearer token is required." });
    return;
  }

  const token = authHeader.slice("Bearer ".length).trim();
  const isOAuth = await isValidOAuthBearerToken(token);
  const isStatic = !!MCP_AUTH_TOKEN && token === MCP_AUTH_TOKEN;

  if (!isOAuth && !isStatic) {
    res.status(401).setHeader("WWW-Authenticate", 'Bearer realm="mcp", error="invalid_token"');
    res.json({ error: "Unauthorized", message: "A valid Bearer token is required." });
    return;
  }

  await nodeHandler(req as never, res as never, req.body);
}