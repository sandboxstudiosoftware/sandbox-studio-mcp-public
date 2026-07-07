import { describe, it, expect, beforeEach, vi } from "vitest";
import { apiRequest } from "../src/client.js";
import * as auth from "../src/auth.js";
import type { Config } from "../src/config.js";

const mockConfig: Config = {
  instanceUrl: "https://example.com/api",
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
};

describe("Client - apiRequest", () => {
  beforeEach(() => {
    auth.clearTokenCache();
    vi.restoreAllMocks();
    vi.spyOn(auth, "getAccessToken").mockResolvedValue("mock-token");
  });

  describe("URL construction", () => {
    it("appends path to instanceUrl preserving base path", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: [] }),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", mockFetch);

      await apiRequest(mockConfig, { method: "GET", path: "/templates/public" });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toBe("https://example.com/api/templates/public");
    });

    it("handles path without leading slash", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: [] }),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", mockFetch);

      await apiRequest(mockConfig, { method: "GET", path: "leases" });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toBe("https://example.com/api/leases");
    });

    it("strips trailing slash from instanceUrl", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: {} }),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", mockFetch);

      await apiRequest(
        { ...mockConfig, instanceUrl: "https://example.com/api/" },
        { method: "GET", path: "/test" }
      );

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toBe("https://example.com/api/test");
    });

    it("adds query params to URL", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: [] }),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", mockFetch);

      await apiRequest(mockConfig, {
        method: "GET",
        path: "/leases",
        query: { pageSize: 10, status: "Active" },
      });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain("pageSize=10");
      expect(calledUrl).toContain("status=Active");
    });

    it("skips undefined/null query params", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: [] }),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", mockFetch);

      await apiRequest(mockConfig, {
        method: "GET",
        path: "/leases",
        query: { pageSize: 10, userId: undefined },
      });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain("pageSize=10");
      expect(calledUrl).not.toContain("userId");
    });

    it("JSON-encodes array query params", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: [] }),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", mockFetch);

      await apiRequest(mockConfig, {
        method: "GET",
        path: "/leases",
        query: { status: ["Active", "Suspended"] },
      });

      const calledUrl = new URL(mockFetch.mock.calls[0][0]);
      const statusParam = calledUrl.searchParams.get("status");
      expect(statusParam).toBe(JSON.stringify(["Active", "Suspended"]));
    });
  });

  describe("Response handling", () => {
    it("unwraps data field from API response", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ status: "success", data: { id: "123" } }),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await apiRequest(mockConfig, { method: "GET", path: "/test" });
      expect(result).toEqual({ id: "123" });
    });

    it("returns raw JSON if no data wrapper", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ items: [1, 2, 3] }),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await apiRequest(mockConfig, { method: "GET", path: "/test" });
      expect(result).toEqual({ items: [1, 2, 3] });
    });

    it("returns undefined for empty response", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "",
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await apiRequest(mockConfig, { method: "DELETE", path: "/test" });
      expect(result).toBeUndefined();
    });
  });

  describe("401 retry", () => {
    it("retries with fresh token on 401", async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return { ok: false, status: 401, text: async () => "Unauthorized", headers: new Headers() };
        }
        return { ok: true, status: 200, text: async () => JSON.stringify({ data: "ok" }), headers: new Headers() };
      });
      vi.stubGlobal("fetch", mockFetch);

      const clearSpy = vi.spyOn(auth, "clearTokenCache");
      const result = await apiRequest(mockConfig, { method: "GET", path: "/test" });

      expect(result).toBe("ok");
      expect(clearSpy).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("Retry on 429/502/503", () => {
    it("retries on 429 with backoff", async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          return { ok: false, status: 429, text: async () => "Rate limited", headers: new Headers() };
        }
        return { ok: true, status: 200, text: async () => JSON.stringify({ data: "success" }), headers: new Headers() };
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await apiRequest(mockConfig, { method: "GET", path: "/test" });

      expect(result).toBe("success");
      // 1 initial + 2 retries (first two fail with 429, third succeeds)
      expect(mockFetch).toHaveBeenCalledTimes(3);
    }, 15000);

    it("throws after max retries exhausted", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => "Rate limited",
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", mockFetch);

      await expect(
        apiRequest(mockConfig, { method: "GET", path: "/test" })
      ).rejects.toThrow("API request failed: GET /test → 429");
    }, 30000);
  });

  describe("Error sanitisation", () => {
    it("does not include tokens in error messages", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => '{"error":"fail","access_token":"secret-token-value"}',
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", mockFetch);

      await expect(
        apiRequest(mockConfig, { method: "GET", path: "/test" })
      ).rejects.not.toThrow(/secret-token-value/);
    });

    it("truncates long error responses", async () => {
      const longResponse = "x".repeat(1000);
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => longResponse,
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", mockFetch);

      try {
        await apiRequest(mockConfig, { method: "GET", path: "/test" });
      } catch (e) {
        expect((e as Error).message.length).toBeLessThan(700);
        expect((e as Error).message).toContain("truncated");
      }
    });
  });

  describe("HTML detection", () => {
    it("retries with fresh token when receiving HTML", async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // First call: returns OK status but HTML body (triggers HTML detection in catch block)
          return {
            ok: true,
            status: 200,
            text: async () => "<!DOCTYPE html><html><body>Login</body></html>",
            headers: new Headers(),
          };
        }
        // Second call (after token refresh): returns JSON
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ data: "real-data" }),
          headers: new Headers(),
        };
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await apiRequest(mockConfig, { method: "GET", path: "/test" });
      expect(result).toBe("real-data");
    });

    it("throws clear error when HTML persists after retry", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "<!DOCTYPE html><html><body>Login</body></html>",
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", mockFetch);

      await expect(
        apiRequest(mockConfig, { method: "GET", path: "/test" })
      ).rejects.toThrow(/authentication or routing issue/);
    });
  });

  describe("Request headers", () => {
    it("sends Authorization and Accept headers", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: {} }),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", mockFetch);

      await apiRequest(mockConfig, { method: "GET", path: "/test" });

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers.Authorization).toBe("Bearer mock-token");
      expect(headers.Accept).toBe("application/json");
    });

    it("sends Content-Type for requests with body", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: {} }),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", mockFetch);

      await apiRequest(mockConfig, { method: "POST", path: "/test", body: { name: "test" } });

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers["Content-Type"]).toBe("application/json");
    });

    it("does not send Content-Type for GET requests", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: {} }),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", mockFetch);

      await apiRequest(mockConfig, { method: "GET", path: "/test" });

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers["Content-Type"]).toBeUndefined();
    });
  });
});
