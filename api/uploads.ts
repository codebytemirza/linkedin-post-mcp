import type { VercelRequest, VercelResponse } from "@vercel/node";
import { MCP_AUTH_TOKEN } from "../lib/config";
import { LinkedInError } from "../lib/errors";
import { getValidAccessToken } from "../lib/linkedin-auth";
import { logEvent } from "../lib/logging";
import { isValidOAuthBearerToken } from "../lib/oauth";
import {
  forwardBytesToLinkedIn,
  getUploadSlotStatus,
} from "../lib/uploads";

/** Shared Bearer-token auth — accepts both OAuth and static MCP_AUTH_TOKEN. */
async function isAuthorized(req: VercelRequest): Promise<boolean> {
  const authHeader = req.headers.authorization ?? "";
  if (!authHeader.startsWith("Bearer ")) return false;
  const token = authHeader.slice("Bearer ".length).trim();
  const isOAuth = await isValidOAuthBearerToken(token);
  const isStatic = !!MCP_AUTH_TOKEN && token === MCP_AUTH_TOKEN;
  return isOAuth || isStatic;
}

/**
 * /api/uploads
 *
 *  PUT  ?fileRef=file_…  → validate raw image bytes and forward directly to
 *                           LinkedIn (bytes never stored in Redis). Polls until
 *                           the image is AVAILABLE, then marks the slot ready.
 *  GET  ?fileRef=file_…  → poll slot status { exists, ready }
 *
 * All methods require a valid Bearer token (same as /api/mcp).
 * Slot creation (Step 1) is done via the get_image_upload_link MCP tool, not here.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // --- Auth ---
  if (!(await isAuthorized(req))) {
    res
      .status(401)
      .setHeader("WWW-Authenticate", 'Bearer realm="mcp", error="invalid_token"');
    res.json({ error: "Unauthorized", message: "A valid Bearer token is required." });
    return;
  }

  // ---------------------------------------------------------------
  // PUT → receive image bytes, forward to LinkedIn, poll until ready
  // ---------------------------------------------------------------
  if (req.method === "PUT") {
    const fileRef =
      typeof req.query.fileRef === "string" ? req.query.fileRef : "";
    if (!fileRef) {
      res
        .status(400)
        .json({ error: "bad_request", message: "Missing ?fileRef= query parameter." });
      return;
    }

    // Collect raw body bytes. Vercel may parse bodies — we need the raw buffer.
    let rawBytes: Buffer;
    if (Buffer.isBuffer(req.body)) {
      rawBytes = req.body;
    } else if (req.body instanceof Uint8Array) {
      rawBytes = Buffer.from(req.body);
    } else if (typeof req.body === "string" && req.body.length > 0) {
      rawBytes = Buffer.from(req.body, "binary");
    } else {
      // Read as raw stream (binary).
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        (req as unknown as NodeJS.ReadableStream).on("data", (c: Buffer) =>
          chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c))
        );
        (req as unknown as NodeJS.ReadableStream).on("end", resolve);
        (req as unknown as NodeJS.ReadableStream).on("error", reject);
      });
      rawBytes = Buffer.concat(chunks);
    }

    if (!rawBytes.length) {
      res.status(400).json({ error: "bad_request", message: "Request body is empty." });
      return;
    }

    try {
      const accessToken = await getValidAccessToken();
      const declaredType =
        typeof req.headers["content-type"] === "string"
          ? req.headers["content-type"]
          : undefined;

      await logEvent("tool", "info", "upload_bytes", {
        detail: `Forwarding ${rawBytes.length} bytes to LinkedIn for fileRef=${fileRef}`,
      });

      await forwardBytesToLinkedIn(fileRef, accessToken, rawBytes, declaredType);

      await logEvent("tool", "success", "upload_bytes", {
        detail: `Bytes forwarded and image ready for fileRef=${fileRef}`,
      });

      res.setHeader("Cache-Control", "no-store");
      res.json({
        ok: true,
        fileRef,
        message: "Image uploaded and processed by LinkedIn. You can now call create_image_post.",
      });
    } catch (err) {
      if (err instanceof LinkedInError) {
        res.status(err.status).json({ error: "upload_error", message: err.message });
        return;
      }
      res.status(500).json({ error: "internal_error", message: String(err) });
    }
    return;
  }

  // ---------------------------------------------------------------
  // GET → poll slot status (AI can check before calling create_image_post)
  // ---------------------------------------------------------------
  if (req.method === "GET") {
    const fileRef =
      typeof req.query.fileRef === "string" ? req.query.fileRef : "";
    if (!fileRef) {
      res.setHeader("Cache-Control", "no-store");
      res.json({
        usage:
          "Use the get_image_upload_link MCP tool to allocate a slot. Then PUT raw image bytes to the returned uploadUrl. Then GET ?fileRef=… to confirm ready=true before calling create_image_post.",
      });
      return;
    }

    const status = await getUploadSlotStatus(fileRef);
    res.setHeader("Cache-Control", "no-store");
    res.json({ fileRef, ...status });
    return;
  }

  res.status(405).json({ error: "method_not_allowed", message: "Use GET or PUT." });
}
