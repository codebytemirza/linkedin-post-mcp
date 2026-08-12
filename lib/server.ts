import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { AUTHORIZE_URL } from "./config";
import { NotAuthorizedError } from "./errors";
import { getValidAccessToken, readStoredTokens } from "./linkedin-auth";
import { logEvent } from "./logging";
import { createLinkedInImagePost, createLinkedInPost, fetchProfile } from "./linkedin-api";
import { createUploadSlot, consumeImageUrn } from "./uploads";

export function textContent(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function authRequiredMessage() {
  return textContent(
    `LinkedIn is not authorized yet. Ask the user to open ${AUTHORIZE_URL} in their browser and complete the LinkedIn sign-in, then try again.`
  );
}

/** Returns the person profile + a fresh access token, or throws NotAuthorizedError. */
async function requireAuthorized() {
  const accessToken = await getValidAccessToken();
  const profile = await fetchProfile(accessToken);
  return { profile, accessToken };
}

function errorContent(error: unknown) {
  if (error instanceof NotAuthorizedError) return authRequiredMessage();
  if (error instanceof Error) {
    void logEvent("error", "error", "mcp_tool_error", { detail: error.message.slice(0, 300) });
    return textContent(`Error: ${error.message}`);
  }
  void logEvent("error", "error", "mcp_tool_error", { detail: String(error).slice(0, 300) });
  return textContent(`Error: ${String(error)}`);
}

/**
 * Builds the LinkedIn MCP server with all tools registered. Shared by both the
 * Vercel HTTP handler (/api/mcp) and the local stdio entry so they never drift.
 */
export function createLinkedInServer(): McpServer {
  const server = new McpServer({
    name: "linkedin-poster",
    version: "1.0.0",
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Tool: create_post
  // ─────────────────────────────────────────────────────────────────────────
  server.registerTool(
    "create_post",
    {
      title: "Create a LinkedIn post",
      description:
        "Publishes a text post to the authorized user's LinkedIn feed. Returns the created post's ID. If the tool reports that LinkedIn is not authorized, do NOT retry; ask the user to open the authorization URL in a browser first.",
      inputSchema: z.object({
        text: z.string().describe("The content of the LinkedIn post to publish."),
        visibility: z
          .enum(["PUBLIC", "CONNECTIONS"])
          .optional()
          .describe("Who can see the post. Defaults to PUBLIC."),
      }),
    },
    async ({ text, visibility }) => {
      try {
        const auth = await requireAuthorized();
        await logEvent("tool", "info", "create_post", { detail: "tool invoked" });
        const id = await createLinkedInPost(auth.accessToken, auth.profile.sub, {
          text,
          visibility: visibility ?? "PUBLIC",
        });
        return textContent(`Post created successfully. Post ID: ${id}`);
      } catch (error) {
        return errorContent(error);
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Tool: get_image_upload_link
  // ─────────────────────────────────────────────────────────────────────────
  server.registerTool(
    "get_image_upload_link",
    {
      title: "Get a signed image upload link",
      description:
        `Allocates a short-lived, single-use image upload slot and returns an uploadUrl and fileRef.

USE THIS INSTEAD OF BASE64 for all image posts. Zero bytes ever pass through the LLM context.

Workflow:
1. Call this tool → receive { uploadUrl, fileRef }.
2. Read the image file from disk and HTTP PUT the raw bytes to uploadUrl.
   - Set Content-Type to image/jpeg, image/png, or image/gif.
   - Include the same Bearer token as the MCP connection in the Authorization header.
   - The server validates the bytes, forwards them to LinkedIn, and waits until processing is complete.
3. Call create_image_post with images: [{ fileRef: "file_…" }].

Notes:
- The slot expires in 10 minutes.
- Each image needs its own call to this tool (call once per image for multi-image posts).
- The PUT step may take up to 30 seconds while LinkedIn processes the image — this is normal.`,
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const auth = await requireAuthorized();
        await logEvent("tool", "info", "get_image_upload_link", { detail: "tool invoked" });
        const { fileRef, uploadUrl } = await createUploadSlot(
          auth.accessToken,
          auth.profile.sub
        );
        return textContent(
          `Upload slot created.\n` +
          `fileRef:   ${fileRef}\n` +
          `uploadUrl: ${uploadUrl}\n\n` +
          `Next steps:\n` +
          `1. PUT your image file's raw bytes to uploadUrl (set Authorization: Bearer <token>, Content-Type: image/jpeg|image/png|image/gif).\n` +
          `2. Call create_image_post with images: [{ fileRef: "${fileRef}" }].`
        );
      } catch (error) {
        return errorContent(error);
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Tool: create_image_post
  // ─────────────────────────────────────────────────────────────────────────
  server.registerTool(
    "create_image_post",
    {
      title: "Create a LinkedIn post with an image",
      description:
        `Publishes a LinkedIn post with one or more images (1–20).

PREFERRED — use fileRef (no base64, no payload limits, no corruption):
  1. For each image call get_image_upload_link → PUT raw bytes to uploadUrl.
  2. Call this tool with images: [{ fileRef: "file_…" }].
  The server retrieves the pre-processed LinkedIn image URN directly from Redis
  (only ~50 bytes stored, zero image bytes in memory).

LEGACY — base64 (kept for backward compatibility):
  Pass images: [{ base64: "…", mediaType: "image/jpeg" }].
  Prone to payload limits and model corruption on large images.

Single image → single-image post. 2–20 images → multi-image post.
Returns the created post's ID.`,
      inputSchema: z.object({
        caption: z.string().describe("The caption/text for the LinkedIn post."),
        images: z
          .array(
            z.union([
              // Preferred: fileRef from get_image_upload_link
              z.object({
                fileRef: z.string().describe("Opaque reference returned by get_image_upload_link."),
                altText: z.string().optional().describe("Accessibility alt text."),
              }),
              // Legacy: raw base64
              z.object({
                base64: z.string().describe("Base64-encoded image bytes without a data URI prefix."),
                mediaType: z
                  .string()
                  .optional()
                  .describe("MIME type, e.g. image/jpeg, image/png."),
                altText: z.string().optional().describe("Accessibility alt text."),
              }),
            ])
          )
          .min(1)
          .max(20)
          .describe("1–20 images. Each must have either fileRef (preferred) or base64 (legacy)."),
        visibility: z
          .enum(["PUBLIC", "CONNECTIONS"])
          .optional()
          .describe("Who can see the post. Defaults to PUBLIC."),
      }),
    },
    async ({ caption, images, visibility }) => {
      try {
        const auth = await requireAuthorized();
        await logEvent("tool", "info", "create_image_post", {
          detail: `tool invoked (${images.length} image(s))`,
        });

        // Resolve each image entry: fileRef → LinkedIn imageUrn (tiny string lookup);
        // base64 → pass through to createLinkedInImagePost as before.
        const resolvedImages = await Promise.all(
          images.map(async (img, i) => {
            if ("fileRef" in img) {
              // Upload-and-forward path: read the pre-uploaded LinkedIn URN from Redis.
              const imageUrn = await consumeImageUrn(img.fileRef);
              return {
                imageUrn,
                altText: img.altText,
              };
            }
            // Legacy base64 path.
            if (!img.base64) {
              throw new Error(`image ${i + 1}: must have either fileRef or base64.`);
            }
            return {
              base64: img.base64,
              mediaType: img.mediaType,
              altText: img.altText,
            };
          })
        );

        const id = await createLinkedInImagePost(auth.accessToken, auth.profile.sub, {
          caption,
          images: resolvedImages,
          visibility: visibility ?? "PUBLIC",
        });
        return textContent(`Post with image(s) created successfully. Post ID: ${id}`);
      } catch (error) {
        return errorContent(error);
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Tool: get_profile
  // ─────────────────────────────────────────────────────────────────────────
  server.registerTool(
    "get_profile",
    {
      title: "Get the LinkedIn profile",
      description: "Returns the authorized user's name and email from their LinkedIn profile.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const auth = await requireAuthorized();
        await logEvent("tool", "info", "get_profile", { detail: "tool invoked" });
        const name = [auth.profile.given_name, auth.profile.family_name]
          .filter(Boolean)
          .join(" ");
        return textContent(
          `LinkedIn profile\nName: ${name || auth.profile.name || "(unknown)"}\nEmail: ${auth.profile.email ?? "(not shared)"}`
        );
      } catch (error) {
        return errorContent(error);
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Tool: check_auth_status
  // ─────────────────────────────────────────────────────────────────────────
  server.registerTool(
    "check_auth_status",
    {
      title: "Check LinkedIn authorization status",
      description:
        "Checks whether LinkedIn tokens exist and are valid, and reports when they expire. Lets you tell the user if they need to authorize.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        await logEvent("tool", "info", "check_auth_status", { detail: "tool invoked" });
        const stored = await readStoredTokens();
        if (!stored?.access_token) {
          return { content: [{ type: "text" as const, text: `Not authorized yet. User should open ${AUTHORIZE_URL}.` }] };
        }
        const now = Date.now();
        const accessExpired = stored.expires_at && now > stored.expires_at;
        if (accessExpired) {
          return { content: [{ type: "text" as const, text: `Access token expired at ${new Date(stored.expires_at).toISOString()}. User should reauthorize at ${AUTHORIZE_URL}.` }] };
        }
        const hasRefresh = !!stored.refresh_token;
        const refreshExpired = hasRefresh && stored.refresh_token_expires_at && now > stored.refresh_token_expires_at;
        if (refreshExpired) {
          return { content: [{ type: "text" as const, text: `Refresh token expired at ${new Date(stored.refresh_token_expires_at).toISOString()}. User should reauthorize at ${AUTHORIZE_URL}.` }] };
        }
        let details = `Access token expires at ${new Date(stored.expires_at).toISOString()}.`;
        if (hasRefresh && stored.refresh_token_expires_at) {
          details += ` Refresh token expires at ${new Date(stored.refresh_token_expires_at).toISOString()}.`;
        } else {
          details += ` No refresh token available (LinkedIn programmatic refresh is not provisioned for this app); the user may need to reauthorize when the access token expires.`;
        }
        return { content: [{ type: "text" as const, text: `Authorized. ${details}` }] };
      } catch (error) {
        return errorContent(error);
      }
    }
  );

  return server;
}