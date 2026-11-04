import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  STATE_BEARING_ACTIONS,
  isStateBearingAction,
  buildActivityPurgeWhere,
  buildActivityClearWhere,
  PURGE_EXEMPT_ENTITY_TYPES,
} from "@/lib/activityProtection";

describe("state-bearing activity-log actions", () => {
  it("covers every action the app reads back as state", () => {
    for (const action of ["delete_customer", "delete_vendor", "add_customer", "add_vendor", "add_product", "add_brand", "add_category"]) {
      expect(isStateBearingAction(action)).toBe(true);
    }
  });

  it("does not protect ordinary audit-only actions", () => {
    for (const action of ["update_customer", "create_invoice", "login", "update_settings", "clear_activity_log", "delete_product"]) {
      expect(isStateBearingAction(action)).toBe(false);
    }
  });

  // Guards against a typo or a rename: every protected action must still be written by some route, and every
  // route that READS one back as state (action: "...") must be using a protected action.
  it("every protected action is actually logged somewhere in src/app/api", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".ts")) files.push(full);
      }
    };
    walk(path.join(process.cwd(), "src", "app", "api"));
    const source = files.map((f) => fs.readFileSync(f, "utf8")).join("\n");
    for (const action of STATE_BEARING_ACTIONS) {
      expect(source.includes(`"${action}"`), `no route logs "${action}"`).toBe(true);
    }
  });

  it("the routes that read a log row back as state only look for protected actions", () => {
    const readers = [
      "src/app/api/bin/route.ts", "src/app/api/bin/empty/route.ts", "src/app/api/bin/[type]/[id]/route.ts",
      "src/app/api/customers/[id]/route.ts", "src/app/api/vendors/[id]/route.ts", "src/app/api/invoices/route.ts",
      "src/app/api/invoices/[id]/route.ts", "src/app/api/purchase-bills/[id]/route.ts", "src/app/api/products/route.ts",
      "src/app/api/products/[id]/route.ts", "src/app/api/brands/route.ts", "src/app/api/brands/[id]/route.ts",
      "src/app/api/categories/[id]/route.ts",
    ];
    for (const rel of readers) {
      const text = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
      // `action: "x"` inside a where clause (not a logActivity("x", ...) call)
      for (const m of text.matchAll(/\baction:\s*"([a-z_]+)"/g)) {
        const action = m[1];
        // "delete_*" lookups for display ("deleted by") are not state; only the markers matter here.
        if (action === "delete_customer" || action === "delete_vendor" || action.startsWith("add_")) {
          expect(isStateBearingAction(action), `${rel} reads "${action}" back as state but it is not protected`).toBe(true);
        }
      }
    }
  });
});

describe("activity-log purge / clear filters", () => {
  const cutoff = new Date("2026-01-01T00:00:00.000Z");

  it("the 30-day purge excludes state-bearing actions and keeps the GST-document exemption and null entityType handling", () => {
    const where = buildActivityPurgeWhere(cutoff);
    expect(where.createdAt).toEqual({ lt: cutoff });
    expect(where.action).toEqual({ notIn: [...STATE_BEARING_ACTIONS] });
    expect(where.OR).toEqual([{ entityType: null }, { entityType: { notIn: [...PURGE_EXEMPT_ENTITY_TYPES] } }]);
  });

  it("'Delete All' excludes exactly the state-bearing actions", () => {
    expect(buildActivityClearWhere()).toEqual({ action: { notIn: [...STATE_BEARING_ACTIONS] } });
  });
});
