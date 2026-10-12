import { describe, expect, it } from "vitest";
import { adToBs, bsToAd } from "../src/lib/nepali-date.js";
import { ALL_PERMISSIONS } from "../src/modules/permissions/permission.catalog.js";
import { resolvePermissions } from "../src/modules/permissions/permission.resolver.js";
import { DEFAULT_SETTINGS, settingsUpdateSchema } from "../src/modules/settings/settings.registry.js";
import { mergeWithDefaults } from "../src/modules/settings/settings.service.js";

describe("resolvePermissions", () => {
  it("unions the permissions of all roles", () => {
    const result = resolvePermissions([["student.view"], ["marks.enter", "student.view"]]);
    expect([...result].sort()).toEqual(["marks.enter", "student.view"]);
  });

  it("expands * to every permission", () => {
    expect(resolvePermissions([["*"]]).size).toBe(ALL_PERMISSIONS.length);
  });

  it("applies per-user GRANT and DENY on top of roles", () => {
    const result = resolvePermissions(
      [["student.view", "student.edit"]],
      [
        { permission: "student.record.view", effect: "GRANT" },
        { permission: "student.edit", effect: "DENY" },
      ],
    );
    expect(result.has("student.record.view")).toBe(true);
    expect(result.has("student.edit")).toBe(false);
    expect(result.has("student.view")).toBe(true);
  });

  it("DENY wins over a wildcard role", () => {
    expect(resolvePermissions([["*"]], [{ permission: "audit.view", effect: "DENY" }]).has("audit.view")).toBe(false);
  });

  it("ignores permissions that are not in the catalog", () => {
    expect(resolvePermissions([["made.up"]], [{ permission: "also.made.up", effect: "GRANT" }]).size).toBe(0);
  });
});

describe("settings", () => {
  it("fills in defaults and drops unknown stored keys", () => {
    const merged = mergeWithDefaults({ "branding.primaryColor": "#ff0000", "removed.setting": true });
    expect(merged["branding.primaryColor"]).toBe("#ff0000");
    expect(merged["localization.dateDisplay"]).toBe(DEFAULT_SETTINGS["localization.dateDisplay"]);
    expect("removed.setting" in merged).toBe(false);
  });

  it("validates values against the registry", () => {
    expect(settingsUpdateSchema.safeParse({ "branding.primaryColor": "#00aa00" }).success).toBe(true);
    expect(settingsUpdateSchema.safeParse({ "branding.primaryColor": "green" }).success).toBe(false);
    expect(settingsUpdateSchema.safeParse({ "security.passwordMinLength": 4 }).success).toBe(false);
    expect(settingsUpdateSchema.safeParse({ "localization.dateDisplay": "julian" }).success).toBe(false);
    expect(settingsUpdateSchema.safeParse({ "academic.workingDays": ["0", "9"] }).success).toBe(false);
  });

  it("rejects unknown setting keys", () => {
    expect(settingsUpdateSchema.safeParse({ "not.a.setting": true }).success).toBe(false);
  });
});

describe("Bikram Sambat conversion", () => {
  it.each([
    ["2025-04-14", "2082-01-01"],
    ["2026-04-14", "2083-01-01"],
    ["2024-04-13", "2081-01-01"],
  ])("AD %s ⇄ BS %s", (ad, bs) => {
    expect(adToBs(ad)).toBe(bs);
    expect(bsToAd(bs)).toBe(ad);
  });

  it("rejects malformed dates", () => {
    expect(() => adToBs("14/04/2025")).toThrow();
  });
});
