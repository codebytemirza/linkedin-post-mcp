import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { MCP_AUTH_TOKEN } from "../lib/config";
import { createLinkedInServer } from "../lib/server";

/**
 * Stateless MCP core: one factory per request, served over Streamable HTTP.
 * All tools live in lib/server.ts and are shared with the stdio entry.
 */
const handler = createMcpHandler(() => createLinkedInServer(), { legacy: "stateless" });
const nodeHandler = toNodeHandler(handler);

/**
 * Vercel serverless function at /api/mcp. Requires an Authorization:
 * Bearer <MCP_AUTH_TOKEN> header on every request before any MCP handling.
 */
export default async function handlerFn(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization ?? "";
  const expected = `Bearer ${MCP_AUTH_TOKEN}`;
  if (!MCP_AUTH_TOKEN || authHeader !== expected) {
    res.status(401).json({ error: "Unauthorized", message: "A valid Bearer token is required." });
    return;
  }

  await nodeHandler(req as never, res as never, req.body);
}