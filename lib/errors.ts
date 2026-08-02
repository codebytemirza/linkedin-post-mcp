/**
 * Thrown by getValidAccessToken() when no tokens have been stored yet,
 * i.e. the user has not gone through the OAuth authorization flow.
 */
export class NotAuthorizedError extends Error {
  constructor() {
    super(
      "LinkedIn is not authorized yet. Open https://post-mcp.vercel.app/api/authorize in your browser to connect your LinkedIn account first."
    );
    this.name = "NotAuthorizedError";
  }
}

/** A structured error carrying an HTTP status from a LinkedIn API response. */
export class LinkedInError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "LinkedInError";
    this.status = status;
    this.code = code;
  }
}

/** A stable token identifier thrown when our LinkedIn credentials are missing. */
export class ConfigError extends Error {
  constructor(missing: string) {
    super(`Missing environment variable(s): ${missing}`);
    this.name = "ConfigError";
  }
}