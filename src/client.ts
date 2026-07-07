import type { Config } from "./config.js";
import { getAccessToken, clearTokenCache } from "./auth.js";
import { logger } from "./logger.js";

export interface ApiResponse<T = unknown> {
  status: number;
  data: T;
}

export interface RequestOptions {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  query?: Record<string, string | string[] | number | boolean | undefined>;
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelay(attempt: number, response?: Response): number {
  // Respect Retry-After header if present
  const retryAfter = response?.headers.get("Retry-After");
  if (retryAfter) {
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) return seconds * 1000;
  }
  // Exponential backoff: 1s, 2s, 4s
  return BASE_DELAY_MS * Math.pow(2, attempt);
}

function isRetryable(status: number): boolean {
  return status === 429 || status === 503 || status === 502;
}

/**
 * Sanitises error response text to avoid leaking sensitive data
 * (tokens, internal URLs, stack traces) to the AI/user.
 */
function sanitiseErrorResponse(responseText: string, maxLength = 500): string {
  // Strip anything that looks like a token or secret
  let sanitised = responseText.replace(
    /Bearer [A-Za-z0-9\-._~+/]+=*/g,
    "Bearer [REDACTED]"
  );
  sanitised = sanitised.replace(
    /"(access_token|client_secret|clientSecret|password|token)"\s*:\s*"[^"]*"/g,
    '"$1": "[REDACTED]"'
  );
  // Truncate to avoid flooding context
  if (sanitised.length > maxLength) {
    sanitised = sanitised.slice(0, maxLength) + "... (truncated)";
  }
  return sanitised;
}

/**
 * Encodes a query parameter value safely.
 * Arrays are JSON-encoded, strings with special characters are preserved.
 */
function encodeQueryValue(value: string | string[] | number | boolean): string {
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Makes an authenticated request to the Sandbox Studio API.
 * Automatically handles:
 * - Token refresh on 401
 * - Retry with exponential backoff on 429/502/503
 * - HTML response detection (auth redirects)
 * - Sanitised error messages
 */
export async function apiRequest<T = unknown>(
  config: Config,
  options: RequestOptions
): Promise<T> {
  const { method, path, body, query } = options;

  // Ensure path is appended to instanceUrl (including any base path like /api)
  const baseUrl = config.instanceUrl.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${baseUrl}${normalizedPath}`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, encodeQueryValue(value));
    }
  }

  const makeRequest = async (token: string): Promise<Response> => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    return fetch(url.toString(), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  };

  logger.debug("API request", { method, path });

  let token = await getAccessToken(config);
  let response = await makeRequest(token);

  // Retry once on 401 (token may have expired)
  if (response.status === 401) {
    logger.warn("Received 401, refreshing token", { method, path });
    clearTokenCache();
    token = await getAccessToken(config);
    response = await makeRequest(token);
  }

  // Retry with exponential backoff on 429/502/503
  if (isRetryable(response.status)) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const delay = getRetryDelay(attempt, response);
      logger.warn("Retryable error, backing off", {
        method,
        path,
        status: response.status,
        attempt: attempt + 1,
        maxRetries: MAX_RETRIES,
        delayMs: delay,
      });
      await sleep(delay);

      token = await getAccessToken(config);
      response = await makeRequest(token);

      if (!isRetryable(response.status)) break;
    }
  }

  const responseText = await response.text();

  if (!response.ok) {
    logger.error("API request failed", { method, path, status: response.status });
    throw new Error(
      `API request failed: ${method} ${path} → ${response.status}\n${sanitiseErrorResponse(responseText)}`
    );
  }

  if (!responseText) {
    return undefined as T;
  }

  try {
    const json = JSON.parse(responseText);
    // The Sandbox Studio API wraps responses in { status: "success", data: ... }
    if (json && typeof json === "object" && "data" in json) {
      return json.data as T;
    }
    return json as T;
  } catch {
    // If the response looks like HTML, it's likely an auth redirect — retry with fresh token
    if (responseText.includes("<!DOCTYPE html>") || responseText.includes("<html")) {
      logger.warn("Received HTML response, attempting token refresh", { method, path });
      clearTokenCache();
      const freshToken = await getAccessToken(config);
      const retryResponse = await makeRequest(freshToken);
      const retryText = await retryResponse.text();

      if (!retryResponse.ok) {
        throw new Error(
          `API request failed after token refresh: ${method} ${path} → ${retryResponse.status}\n${sanitiseErrorResponse(retryText)}`
        );
      }

      if (retryText.includes("<!DOCTYPE html>") || retryText.includes("<html")) {
        throw new Error(
          `API returned HTML instead of JSON for ${method} ${path}. This usually indicates an authentication or routing issue.`
        );
      }

      const retryJson = JSON.parse(retryText);
      if (retryJson && typeof retryJson === "object" && "data" in retryJson) {
        return retryJson.data as T;
      }
      return retryJson as T;
    }
    return responseText as T;
  }
}
