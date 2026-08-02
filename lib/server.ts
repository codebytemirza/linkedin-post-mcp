import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { AUTHORIZE_URL } from "./config";
import { NotAuthorizedError } from "./errors";
import { getValidAccessToken, readStoredTokens } from "./linkedin-auth";
import { logEvent } from "./logging";
import { createLinkedInImagePost, createLinkedInPost, fetchProfile } from "./linkedin-api";

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

  server.registerTool(
    "create_post",
    {
      title: "Create a LinkedIn post",
      description:
        "Publishes a text post to the authorized user's LinkedIn feed. Returns the created post's ID.",
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

  server.registerTool(
    "create_image_post",
    {
      title: "Create a LinkedIn post with an image",
      description:
        "Uploads one or more images and publishes a LinkedIn post with a caption to the authorized user's feed. Images are supplied as base64-encoded bytes. One image renders as a single-image post; two or more render as a multi-image post. Returns the created post's ID.",
      inputSchema: z.object({
        caption: z.string().describe("The caption/text for the LinkedIn post."),
        images: z
          .array(
            z.object({
              base64: z.string().describe("Base64-encoded image bytes, without a data URI prefix."),
              mediaType: z
                .string()
                .optional()
                .describe("MIME type of the image (e.g. image/jpeg, image/png)."),
              altText: z.string().optional().describe("Accessibility alt text for the image."),
            })
          )
          .min(1)
          .max(20)
          .describe("Between 1 and 20 images to attach to the post (JPG/GIF/PNG)."),
        visibility: z
          .enum(["PUBLIC", "CONNECTIONS"])
          .optional()
          .describe("Who can see the post. Defaults to PUBLIC."),
      }),
    },
    async ({ caption, images, visibility }) => {
      try {
        const auth = await requireAuthorized();
        await logEvent("tool", "info", "create_image_post", { detail: `tool invoked (${images.length} image(s))` });
        const id = await createLinkedInImagePost(auth.accessToken, auth.profile.sub, {
          caption,
          images,
          visibility: visibility ?? "PUBLIC",
        });
        return textContent(`Post with image(s) created successfully. Post ID: ${id}`);
      } catch (error) {
        return errorContent(error);
      }
    }
  );

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