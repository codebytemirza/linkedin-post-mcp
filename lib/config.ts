import { Redis } from "@upstash/redis";

export const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID ?? "";
export const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET ?? "";
export const LINKEDIN_REDIRECT_URI = process.env.LINKEDIN_REDIRECT_URI ?? "";
export const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN ?? "";

export const AUTHORIZE_URL = "https://post-mcp.vercel.app/api/authorize";

export const LINKEDIN_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
export const LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
export const LINKEDIN_USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
export const LINKEDIN_POSTS_URL = "https://api.linkedin.com/rest/posts";
export const LINKEDIN_IMAGE_INIT_URL = "https://api.linkedin.com/rest/images?action=initializeUpload";
export const LINKEDIN_ASSET_REGISTER_URL = "https://api.linkedin.com/rest/assets?action=registerUpload";

// A currently supported, versioned marketing/rest API date (YYYYMM).
export const LINKEDIN_API_VERSION = "202607";

export const OAUTH_SCOPES = ["openid", "profile", "email", "w_member_social"];

export const TOKEN_CACHE_KEY = "linkedin:tokens";
export const PENDING_STATE_KEY = "linkedin:auth:pending-state";

// Per the Upstash skill: create the client from environment variables and let
// the SDK auto-serialize/deserialize JS types.
export const redis = Redis.fromEnv();