// The character cap leaves room for escaping and MCP's text plus structured
// copies. Short fields do not spend that budget, so the encoded guard also
// bounds the whole result below Vercel's 4.5 MB response limit.
export const MAX_CHARACTERS = 200_000;
export const MAX_ENCODED_RESULT_BYTES = 4_000_000;

// Keep inline JSON below Vercel's 4.5 MB request limit. Base64 uses 4 bytes
// per 3 source bytes, so the 2 MiB body budget holds less than 1.5 MiB of file.
// Public document URLs let the provider fetch larger files directly.
export const MAX_REQUEST_BODY_BYTES = 2_097_152;
