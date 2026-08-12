import { randomBytes } from "node:crypto";
import {
  APP_BASE_URL,
  LINKEDIN_API_VERSION,
  LINKEDIN_IMAGE_INIT_URL,
  redis,
  UPLOAD_FILE_PREFIX,
} from "./config";
import { LinkedInError } from "./errors";

/** TTL for an upload slot (seconds). Covers the time for the AI to PUT bytes. */
const UPLOAD_TTL_SECONDS = 600; // 10 minutes

/**
 * What we store in Redis — only tiny strings, never image bytes.
 *
 * Lifecycle:
 *   ready=false  → slot created, awaiting bytes from AI
 *   ready=true   → bytes forwarded to LinkedIn, imageUrn stored; ready for create_image_post
 */
interface UploadSlot {
  createdAt: number;
  ready: boolean;
  /** LinkedIn image URN — populated after bytes are forwarded and processed. */
  imageUrn?: string;
  /** LinkedIn upload URL — stored so /api/uploads can forward bytes to it. */
  linkedinUploadUrl?: string;
}

function redisKey(fileRef: string): string {
  return `${UPLOAD_FILE_PREFIX}${fileRef}`;
}

/**
 * Step 1 of the upload-and-forward flow.
 *
 * Calls LinkedIn's initializeUpload API to pre-allocate an image slot,
 * then stores the resulting { linkedinUploadUrl, imageUrn } in Redis
 * (both are short strings — no bytes ever hit Redis).
 *
 * Returns the opaque fileRef and the URL the AI should PUT bytes to.
 */
export async function createUploadSlot(
  accessToken: string,
  personSub: string
): Promise<{ fileRef: string; uploadUrl: string }> {
  // Ask LinkedIn to allocate an image upload slot.
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
      `LinkedIn initializeUpload failed (${initRes.status}): ${body.slice(0, 500)}`
    );
  }

  const initJson = (await initRes.json()) as {
    value?: { uploadUrl?: string; image?: string };
  };
  const { uploadUrl: linkedinUploadUrl, image: imageUrn } = initJson.value ?? {};
  if (!linkedinUploadUrl || !imageUrn) {
    throw new LinkedInError(500, "LinkedIn initializeUpload response missing uploadUrl or image URN.");
  }

  // Persist only the tiny strings — never image bytes.
  const fileRef = `file_${randomBytes(16).toString("hex")}`;
  const slot: UploadSlot = {
    createdAt: Date.now(),
    ready: false,
    linkedinUploadUrl,
    imageUrn,
  };
  await redis.set(redisKey(fileRef), slot, { ex: UPLOAD_TTL_SECONDS });

  const uploadUrl = `${APP_BASE_URL}/api/uploads?fileRef=${encodeURIComponent(fileRef)}`;
  return { fileRef, uploadUrl };
}

/**
 * Step 2 of the upload-and-forward flow.
 *
 * Called by PUT /api/uploads. Validates the raw bytes, forwards them directly
 * to LinkedIn's pre-signed upload URL (bytes are never written to Redis),
 * then polls LinkedIn until the image is AVAILABLE. Updates the slot to
 * ready=true with just the imageUrn.
 *
 * Throws LinkedInError on any failure.
 */
export async function forwardBytesToLinkedIn(
  fileRef: string,
  accessToken: string,
  rawBytes: Buffer,
  declaredContentType?: string
): Promise<void> {
  const key = redisKey(fileRef);
  const slot = await redis.get<UploadSlot>(key);

  if (!slot) {
    throw new LinkedInError(404, `Upload slot "${fileRef}" not found or expired.`);
  }
  if (slot.ready) {
    throw new LinkedInError(409, `Upload slot "${fileRef}" already has bytes uploaded.`);
  }
  if (!slot.linkedinUploadUrl || !slot.imageUrn) {
    throw new LinkedInError(500, `Upload slot "${fileRef}" is missing LinkedIn upload metadata.`);
  }

  // --- Validate magic bytes ---
  if (rawBytes.length < 16) {
    throw new LinkedInError(
      400,
      `Uploaded payload too small (${rawBytes.length} bytes). Send the complete image file.`
    );
  }

  const isJpeg = rawBytes[0] === 0xff && rawBytes[1] === 0xd8 && rawBytes[2] === 0xff;
  const isPng =
    rawBytes[0] === 0x89 &&
    rawBytes[1] === 0x50 &&
    rawBytes[2] === 0x4e &&
    rawBytes[3] === 0x47 &&
    rawBytes[4] === 0x0d &&
    rawBytes[5] === 0x0a &&
    rawBytes[6] === 0x1a &&
    rawBytes[7] === 0x0a;
  const isGif =
    rawBytes[0] === 0x47 &&
    rawBytes[1] === 0x49 &&
    rawBytes[2] === 0x46 &&
    rawBytes[3] === 0x38;

  let mediaType: string;
  if (isJpeg) mediaType = "image/jpeg";
  else if (isPng) mediaType = "image/png";
  else if (isGif) mediaType = "image/gif";
  else {
    throw new LinkedInError(
      400,
      "Bytes do not match JPEG, PNG, or GIF format. Only send real image files."
    );
  }

  if (declaredContentType) {
    const declared = declaredContentType.split(";")[0].trim().toLowerCase();
    if (declared !== mediaType) {
      throw new LinkedInError(
        400,
        `Content-Type "${declared}" does not match detected format "${mediaType}".`
      );
    }
  }

  // --- Forward bytes directly to LinkedIn (bytes never touch Redis) ---
  const uploadRes = await fetch(slot.linkedinUploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": mediaType,
      "Content-Length": String(rawBytes.length),
    },
    body: rawBytes,
  });

  if (uploadRes.status !== 200 && uploadRes.status !== 201) {
    const body = await uploadRes.text().catch(() => "");
    throw new LinkedInError(
      uploadRes.status,
      `LinkedIn image upload failed (${uploadRes.status}): ${body.slice(0, 500)}`
    );
  }

  // --- Poll until LinkedIn marks the image AVAILABLE ---
  const imageId = encodeURIComponent(slot.imageUrn);
  const deadline = Date.now() + 30_000;

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
      if (
        statusJson.status === "AVAILABLE" ||
        (statusJson.downloadUrl && statusJson.downloadUrl.length > 0)
      ) {
        // Mark slot ready — store only the URN, clear the upload URL to free memory.
        const updated: UploadSlot = {
          createdAt: slot.createdAt,
          ready: true,
          imageUrn: slot.imageUrn,
          // linkedinUploadUrl intentionally omitted — no longer needed.
        };
        await redis.set(key, updated, { ex: UPLOAD_TTL_SECONDS });
        return;
      }
      if (statusJson.status === "PROCESSING_FAILED") {
        throw new LinkedInError(500, "LinkedIn image processing failed.");
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new LinkedInError(504, `LinkedIn image processing did not complete in 30 seconds (${slot.imageUrn}).`);
}

/**
 * Step 3 of the upload-and-forward flow.
 *
 * Called by create_image_post. Reads and deletes the stored imageUrn from
 * Redis — single-use; the slot is gone immediately after this call.
 *
 * Throws LinkedInError when the slot is missing, expired, or not yet ready.
 */
export async function consumeImageUrn(fileRef: string): Promise<string> {
  const key = redisKey(fileRef);
  const slot = await redis.get<UploadSlot>(key);

  if (!slot) {
    throw new LinkedInError(
      404,
      `File reference "${fileRef}" not found. It may have expired (10-min TTL) or already been used. Call get_image_upload_link again.`
    );
  }
  if (!slot.ready || !slot.imageUrn) {
    throw new LinkedInError(
      409,
      `File reference "${fileRef}" is not ready yet — bytes have not been PUT to the uploadUrl. Complete the upload first.`
    );
  }

  // Single-use: delete immediately.
  await redis.del(key);
  return slot.imageUrn;
}

/**
 * Returns slot status without consuming it. Used by GET /api/uploads.
 */
export async function getUploadSlotStatus(
  fileRef: string
): Promise<{ exists: boolean; ready: boolean }> {
  const slot = await redis.get<UploadSlot>(redisKey(fileRef));
  if (!slot) return { exists: false, ready: false };
  return { exists: true, ready: slot.ready === true };
}
