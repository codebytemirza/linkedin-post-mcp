# LinkedIn MCP Usage Guide

## How to invoke the tools

From Claude or Codex, ask in natural language. The available tools are:

- `create_post(text, visibility?)` for text posts
- `create_image_post(caption, images[], visibility?)` for image posts
- `get_profile` for your name and email
- `check_auth_status` to confirm authorization and token expiry

Reference parameters are visible in Claude once connected, and the output will show a summary of the suggested arguments.

## Best practices for text posts

- Keep posts under the 3,000-character commentary cap because LinkedIn hard-cuts longer text.
- Write the full post in plain text and use real newlines for paragraphs.
- Add hashtags naturally in the text, like `#career`.
- Use `visibility: "PUBLIC"` for broadcast posts and `CONNECTIONS` for private-ish posts.
- Check auth first if you are unsure: `check_auth_status`.

## Best practices for image posts

- Supported formats: JPG, PNG, GIF
- Keep GIFs at 250 frames or fewer.
- Keep images under about 6.3MP, or 36,152,320 pixels, because LinkedIn rejects larger files.
- Pass raw base64 only, with no `data:` prefix.
- Always include `altText` for accessibility. Keep it under 120 characters if possible.
- Give the MCP one strong caption; use the same caption for multi-image posts.
- Single image posts behave like classic feed posts. Two or more images behave like a LinkedIn carousel-style document post.

## Auth and re-auth

- LinkedIn access tokens expire after about 60 days unless refreshed.
- If a call returns `LinkedIn is not authorized...`, open `/api/authorize` on the deployed app or `http://localhost:3000/api/authorize` locally to reconnect.
- You do not need to change the config when re-authorizing.
- Always check `check_auth_status` before a batch of posts if you suspect token trouble.

## Rate limits

- LinkedIn members get 150 requests per day.
- Avoid spamming many posts in a row. Batch and space them out.

## Recommended setup

- Claude Desktop: local stdio via `node D:\mcp-post\mcp-stdio.mjs` with `.env` auto-loaded.
- Codex: the same stdio line in `~/.codex/config.toml`.
- Remote/web: use `https://post-mcp.vercel.app/api/mcp` with `Authorization: Bearer <token>` from a client that can send headers.

## Troubleshooting

- `not valid MCP` or the server will not load: use the local stdio entry and fully restart the client.
- Token expired message: re-authorize at the `/api/authorize` URL once.
- Image post fails with 400, 413, or 422: check that the image is JPG, PNG, or GIF under 6MP and that the base64 has no prefix.
- `403` or no-permission errors: re-authorize with fresh `w_member_social` scope, or you may be out of the daily limit.
