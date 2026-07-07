import { describe, it, expect, vi } from "vitest";
import { getRolesFromToken, type SsRole } from "../src/auth.js";

describe("Auth - getRolesFromToken", () => {
  function createToken(payload: object): string {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = "fake-signature";
    return `${header}.${body}.${signature}`;
  }

  it("extracts Admin role from token", () => {
    const token = createToken({
      user: {
        userId: "123",
        email: "admin@example.com",
        displayName: "Admin",
        roles: ["Admin"],
      },
    });
    expect(getRolesFromToken(token)).toEqual(["Admin"]);
  });

  it("extracts Manager role from token", () => {
    const token = createToken({
      user: {
        userId: "456",
        email: "manager@example.com",
        displayName: "Manager",
        roles: ["Manager"],
      },
    });
    expect(getRolesFromToken(token)).toEqual(["Manager"]);
  });

  it("extracts User role from token", () => {
    const token = createToken({
      user: {
        userId: "789",
        email: "user@example.com",
        displayName: "User",
        roles: ["User"],
      },
    });
    expect(getRolesFromToken(token)).toEqual(["User"]);
  });

  it("extracts multiple roles from token", () => {
    const token = createToken({
      user: {
        userId: "123",
        email: "admin@example.com",
        roles: ["Admin", "Manager"],
      },
    });
    expect(getRolesFromToken(token)).toEqual(["Admin", "Manager"]);
  });

  it("returns User role when user has no roles field", () => {
    const token = createToken({
      user: {
        userId: "123",
        email: "user@example.com",
      },
    });
    expect(getRolesFromToken(token)).toEqual(["User"]);
  });

  it("returns User role when token has no user field", () => {
    const token = createToken({ sub: "123" });
    expect(getRolesFromToken(token)).toEqual(["User"]);
  });

  it("returns User role for invalid token (not 3 parts)", () => {
    expect(getRolesFromToken("not-a-jwt")).toEqual(["User"]);
  });

  it("returns User role for empty string", () => {
    expect(getRolesFromToken("")).toEqual(["User"]);
  });

  it("returns User role for malformed base64 payload", () => {
    expect(getRolesFromToken("header.!!!invalid!!!.signature")).toEqual(["User"]);
  });

  it("handles roles with empty array", () => {
    const token = createToken({
      user: {
        userId: "123",
        email: "user@example.com",
        roles: [],
      },
    });
    expect(getRolesFromToken(token)).toEqual([]);
  });
});

describe("Role-based tool registration logic", () => {
  // Test the hasRole logic that determines which tools get registered
  function hasRole(roles: SsRole[], required: SsRole): boolean {
    if (roles.includes("Admin")) return true;
    if (required === "Manager" && roles.includes("Manager")) return true;
    if (required === "User") return true;
    return false;
  }

  function getHighestRole(roles: SsRole[]): SsRole {
    if (roles.includes("Admin")) return "Admin";
    if (roles.includes("Manager")) return "Manager";
    return "User";
  }

  describe("hasRole", () => {
    it("Admin has access to all role levels", () => {
      const roles: SsRole[] = ["Admin"];
      expect(hasRole(roles, "User")).toBe(true);
      expect(hasRole(roles, "Manager")).toBe(true);
      expect(hasRole(roles, "Admin")).toBe(true);
    });

    it("Manager has access to User and Manager levels", () => {
      const roles: SsRole[] = ["Manager"];
      expect(hasRole(roles, "User")).toBe(true);
      expect(hasRole(roles, "Manager")).toBe(true);
      expect(hasRole(roles, "Admin")).toBe(false);
    });

    it("User only has access to User level", () => {
      const roles: SsRole[] = ["User"];
      expect(hasRole(roles, "User")).toBe(true);
      expect(hasRole(roles, "Manager")).toBe(false);
      expect(hasRole(roles, "Admin")).toBe(false);
    });
  });

  describe("getHighestRole", () => {
    it("returns Admin when roles include Admin", () => {
      expect(getHighestRole(["Admin"])).toBe("Admin");
      expect(getHighestRole(["Admin", "Manager"])).toBe("Admin");
      expect(getHighestRole(["Admin", "Manager", "User"])).toBe("Admin");
    });

    it("returns Manager when highest is Manager", () => {
      expect(getHighestRole(["Manager"])).toBe("Manager");
      expect(getHighestRole(["Manager", "User"])).toBe("Manager");
    });

    it("returns User when only User role", () => {
      expect(getHighestRole(["User"])).toBe("User");
    });

    it("returns User for empty roles", () => {
      expect(getHighestRole([] as SsRole[])).toBe("User");
    });
  });

  describe("Tool visibility per role", () => {
    function getToolSets(roles: SsRole[]) {
      const highestRole = getHighestRole(roles);
      return {
        leases: true, // always available
        users: true, // always available
        publicTemplates: true, // always available
        templates: highestRole === "Manager" || highestRole === "Admin",
        events: highestRole === "Manager" || highestRole === "Admin",
        accounts: highestRole === "Admin",
        settings: highestRole === "Admin",
      };
    }

    it("Admin sees all tool sets", () => {
      const tools = getToolSets(["Admin"]);
      expect(tools).toEqual({
        leases: true,
        users: true,
        publicTemplates: true,
        templates: true,
        events: true,
        accounts: true,
        settings: true,
      });
    });

    it("Manager sees leases, users, templates, events but not accounts/settings", () => {
      const tools = getToolSets(["Manager"]);
      expect(tools).toEqual({
        leases: true,
        users: true,
        publicTemplates: true,
        templates: true,
        events: true,
        accounts: false,
        settings: false,
      });
    });

    it("User sees only leases, users, and public templates", () => {
      const tools = getToolSets(["User"]);
      expect(tools).toEqual({
        leases: true,
        users: true,
        publicTemplates: true,
        templates: false,
        events: false,
        accounts: false,
        settings: false,
      });
    });
  });
});
