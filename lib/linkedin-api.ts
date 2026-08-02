import {
  LINKEDIN_API_VERSION,
  LINKEDIN_IMAGE_INIT_URL,
  LINKEDIN_POSTS_URL,
  LINKEDIN_USERINFO_URL,
} from "./config";
import { LinkedInError } from "./errors";
import { getValidAccessToken } from "./linkedin-auth";
import { logEvent } from "./logging";

export interface Profile {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
}

interface LinkedInUserinfoPayload {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  email_verified?: boolean;
  picture?: string;
  locale?: string;
}

/**
 * Fetches the authenticated member's OpenID Connect profile from LinkedIn's
 * userinfo endpoint (verified via Microsoft Learn: GET
 * https://api.linkedin.com/v2/userinfo with Bearer token).
 */
export async function fetchProfile(accessToken: string): Promise<Profile> {
  const res = await fetch(LINKEDIN_USERINFO_URL, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new LinkedInError(res.status, `userinfo failed (${res.status}): ${text.slice(0, 500)}`);
  }

  return (await res.json()) as LinkedInUserinfoPayload;
}

export interface CreatePostArgs {
  text: string;
  visibility?: "PUBLIC" | "CONNECTIONS";
}

/**
 * Creates a LinkedIn text post for the authenticated member via the Posts API
 * (verified via Microsoft Learn: POST https://api.linkedin.com/rest/posts with
 * X-Restli-Protocol-Version: 2.0.0, LinkedIn-Version: YYYYMM, Bearer token).
 * Returns the created post ID (the x-restli-id header).
 */
export async function createLinkedInPost(
  accessToken: string,
  personSub: string,
  args: CreatePostArgs
): Promise<string> {
  const author = `urn:li:person:${personSub}`;
  const visibility = args.visibility ?? "PUBLIC";

  const res = await fetch(LINKEDIN_POSTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": LINKEDIN_API_VERSION,
    },
    body: JSON.stringify({
      author,
      commentary: args.text,
      visibility,
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    await logEvent("post", "error", "create_post", { detail: `HTTP ${res.status}: ${body.slice(0, 200)}` });
    throw new LinkedInError(res.status, `create_post failed (${res.status}): ${body.slice(0, 500)}`);
  }

  const id = res.headers.get("x-restli-id");
  if (!id) return `x-restli-id missing, status ${res.status}`;
  await logEvent("post", "success", "create_post", { postId: id });
  return id;
}

export interface ImageInput {
  /** Base64-encoded image bytes (no data URI prefix). */
  base64: string;
  /** MIME type, e.g. "image/jpeg", "image/png". */
  mediaType?: string;
  /** Optional alt text for accessibility. */
  altText?: string;
}

export interface CreateImagePostArgs {
  caption: string;
  images: ImageInput[];
  visibility?: "PUBLIC" | "CONNECTIONS";
}

function decodeBase64(data: string): Buffer {
  const withoutPrefix = data.includes(",") ? data.slice(data.indexOf(",") + 1) : data;
  return Buffer.from(withoutPrefix, "base64");
}

/**
 * Registers an image upload via the Images API (asynchronous), uploads the
 * binary bytes, then polls the image status using a versioned GET until the
 * image has finished processing (downloadUrl populated / status AVAILABLE).
 * Per Microsoft Learn, the Images API does not support synchronous upload, and
 * a post created before the image finishes processing renders blank.
 * Returns the resulting "urn:li:image:{id}" asset URN once ready.
 */
async function uploadLinkedInImage(accessToken: string, personSub: string, input: ImageInput): Promise<string> {
  const bytes = decodeBase64(input.base64);
  const initRes = await fetch(LINKEDIN_IMAGE_INIT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": LINKEDIN_API_VERSION,
    },
    body: JSON.stringify({
      initializeUploadRequest: { owner: `urn:li:person:${personSub}` },
    }),
  });

  if (!initRes.ok) {
    const body = await initRes.text().catch(() => "");
    throw new LinkedInError(
      initRes.status,
      `image initializeUpload failed (${initRes.status}): ${body.slice(0, 500)}`
    );
  }

  const initJson = (await initRes.json()) as {
    value?: { uploadUrl?: string; image?: string };
  };
  const { uploadUrl, image: imageUrn } = initJson.value ?? {};
  if (!uploadUrl || !imageUrn) {
    throw new LinkedInError(500, "image initializeUpload response missing uploadUrl/image");
  }

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": input.mediaType ?? "application/octet-stream",
      "Content-Length": String(bytes.length),
    },
    body: bytes,
  });

  if (uploadRes.status !== 200 && uploadRes.status !== 201) {
    const body = await uploadRes.text().catch(() => "");
    throw new LinkedInError(
      uploadRes.status,
      `image upload failed (${uploadRes.status}): ${body.slice(0, 500)}`
    );
  }

  // Poll the image status until it is AVAILABLE so the post references a fully
  // processed image. The versioned GET on the image URN is permitted for the
  // asset owner; the legacy GET (no header) returns VERSION_MISSING.
  const imageId = encodeURIComponent(imageUrn);
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const statusRes = await fetch(`https://api.linkedin.com/rest/images/${imageId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "LinkedIn-Version": LINKEDIN_API_VERSION,
      },
    });

    if (statusRes.ok) {
      const statusJson = (await statusRes.json().catch(() => ({}))) as {
        status?: string;
        downloadUrl?: string;
      };
      const status = statusJson.status;
      if (status === "AVAILABLE" || (statusJson.downloadUrl && statusJson.downloadUrl.length > 0)) {
        return imageUrn;
      }
      if (status === "PROCESSING_FAILED") {
        throw new LinkedInError(500, `image processing failed with status: ${status}`);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new LinkedInError(504, `image processing did not complete in time (${imageUrn})`);
}

/**
 * Uploads one or more images then creates a LinkedIn post with a caption.
 * A single image uses content.media; multiple images use content.multiImage.
 * Returns the created post ID (the x-restli-id header).
 */
export async function createLinkedInImagePost(
  accessToken: string,
  personSub: string,
  args: CreateImagePostArgs
): Promise<string> {
  const urns: { id: string; altText?: string }[] = [];
  for (const image of args.images) {
    urns.push({ id: await uploadLinkedInImage(accessToken, personSub, image), altText: image.altText });
  }

  let content: unknown;
  if (urns.length === 1) {
    content = { media: { id: urns[0].id, ...(urns[0].altText ? { altText: urns[0].altText } : {}) } };
  } else if (urns.length > 1) {
    content = {
      multiImage: { images: urns.map((u) => ({ id: u.id, ...(u.altText ? { altText: u.altText } : {}) })) },
    };
  } else {
    throw new LinkedInError(400, "create_image_post requires at least one image");
  }

  const res = await fetch(LINKEDIN_POSTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": LINKEDIN_API_VERSION,
    },
    body: JSON.stringify({
      author: `urn:li:person:${personSub}`,
      commentary: args.caption,
      visibility: args.visibility ?? "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
      content,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    await logEvent("post", "error", "create_image_post", { detail: `HTTP ${res.status}: ${body.slice(0, 200)}` });
    throw new LinkedInError(
      res.status,
      `create_image_post failed (${res.status}): ${body.slice(0, 500)}`
    );
  }

  const id = res.headers.get("x-restli-id");
  if (!id) return `x-restli-id missing, status ${res.status}`;
  await logEvent("post", "success", "create_image_post", {
    detail: `${urns.length} image${urns.length > 1 ? "s" : ""}`,
    postId: id,
  });
  return id;
}