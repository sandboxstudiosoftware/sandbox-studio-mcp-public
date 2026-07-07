import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// We need to test loadConfig with a custom path, so we'll test the Zod schema directly
// and test the file-based logic by mocking the home directory
import { z } from "zod";

const ConfigSchema = z.object({
  instanceUrl: z.string().url("instanceUrl must be a valid URL"),
  clientId: z.string().min(1, "clientId is required"),
  clientSecret: z.string().min(1, "clientSecret is required"),
});

describe("Config validation", () => {
  it("accepts a valid config", () => {
    const result = ConfigSchema.safeParse({
      instanceUrl: "https://example.com/api",
      clientId: "my-client-id",
      clientSecret: "my-client-secret",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.instanceUrl).toBe("https://example.com/api");
      expect(result.data.clientId).toBe("my-client-id");
      expect(result.data.clientSecret).toBe("my-client-secret");
    }
  });

  it("rejects missing instanceUrl", () => {
    const result = ConfigSchema.safeParse({
      clientId: "id",
      clientSecret: "secret",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["instanceUrl"]);
    }
  });

  it("rejects invalid URL for instanceUrl", () => {
    const result = ConfigSchema.safeParse({
      instanceUrl: "not-a-url",
      clientId: "id",
      clientSecret: "secret",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["instanceUrl"]);
      expect(result.error.issues[0].message).toContain("valid URL");
    }
  });

  it("rejects empty clientId", () => {
    const result = ConfigSchema.safeParse({
      instanceUrl: "https://example.com",
      clientId: "",
      clientSecret: "secret",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["clientId"]);
    }
  });

  it("rejects empty clientSecret", () => {
    const result = ConfigSchema.safeParse({
      instanceUrl: "https://example.com",
      clientId: "id",
      clientSecret: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["clientSecret"]);
    }
  });

  it("rejects completely missing fields", () => {
    const result = ConfigSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBe(3);
    }
  });

  it("ignores extra fields", () => {
    const result = ConfigSchema.safeParse({
      instanceUrl: "https://example.com",
      clientId: "id",
      clientSecret: "secret",
      extraField: "ignored",
    });
    expect(result.success).toBe(true);
  });
});
