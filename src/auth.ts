import type { Config } from "./config.js";
import { logger } from "./logger.js";

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

/**
 * Fetches an OAuth2 access token using client_credentials grant.
 * Caches the token and auto-refreshes when expired (with 60s buffer).
 */
export async function getAccessToken(config: Config): Promise<string> {
  const now = Date.now();
  const BUFFER_MS = 60_000; // refresh 60s before actual expiry

  if (cachedToken && cachedToken.expiresAt - BUFFER_MS > now) {
    return cachedToken.accessToken;
  }

  const tokenUrl = `${config.instanceUrl}/api/oauth/token`;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const text = await response.text();
    logger.error("OAuth token request failed", { status: response.status });
    throw new Error(
      `OAuth token request failed (${response.status}). Check your client credentials and instance URL.`
    );
  }

  const data = (await response.json()) as TokenResponse;

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };

  return cachedToken.accessToken;
}

/**
 * Clears the cached token (useful for forcing re-auth on 401).
 */
export function clearTokenCache(): void {
  cachedToken = null;
}

export type SsRole = "Admin" | "Manager" | "User";

interface JwtPayload {
  user?: {
    email?: string;
    displayName?: string;
    userId?: string;
    roles?: SsRole[];
  };
}

/**
 * Decodes the JWT token payload without verification (server already verified it).
 * Returns the user's roles from the token.
 */
export function getRolesFromToken(token: string): SsRole[] {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return ["User"];
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf-8")
    ) as JwtPayload;
    return payload.user?.roles ?? ["User"];
  } catch {
    return ["User"];
  }
}
