import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getAccessToken, clearTokenCache } from "../src/auth.js";
import type { Config } from "../src/config.js";

const mockConfig: Config = {
  instanceUrl: "https://example.com/api",
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
};

describe("Auth - getAccessToken", () => {
  beforeEach(() => {
    clearTokenCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches a new token on first call", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "new-token-123",
        token_type: "Bearer",
        expires_in: 3600,
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const token = await getAccessToken(mockConfig);

    expect(token).toBe("new-token-123");
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com/api/oauth/token",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      })
    );
  });

  it("returns cached token on subsequent calls", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "cached-token",
        token_type: "Bearer",
        expires_in: 3600,
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const token1 = await getAccessToken(mockConfig);
    const token2 = await getAccessToken(mockConfig);

    expect(token1).toBe("cached-token");
    expect(token2).toBe("cached-token");
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("refreshes token after clearTokenCache", async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        ok: true,
        json: async () => ({
          access_token: `token-${callCount}`,
          token_type: "Bearer",
          expires_in: 3600,
        }),
      };
    });
    vi.stubGlobal("fetch", mockFetch);

    const token1 = await getAccessToken(mockConfig);
    expect(token1).toBe("token-1");

    clearTokenCache();
    const token2 = await getAccessToken(mockConfig);
    expect(token2).toBe("token-2");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws on failed token request", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(getAccessToken(mockConfig)).rejects.toThrow(
      "OAuth token request failed (401)"
    );
  });

  it("does not leak response body in error message", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"error":"invalid_client","secret":"super-secret-value"}',
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(getAccessToken(mockConfig)).rejects.toThrow(
      /Check your client credentials/
    );
    await expect(getAccessToken(mockConfig)).rejects.not.toThrow(
      /super-secret-value/
    );
  });

  it("sends correct body params", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "token",
        token_type: "Bearer",
        expires_in: 3600,
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await getAccessToken(mockConfig);

    const call = mockFetch.mock.calls[0];
    const body = call[1].body;
    expect(body).toContain("grant_type=client_credentials");
    expect(body).toContain("client_id=test-client-id");
    expect(body).toContain("client_secret=test-client-secret");
  });
});
