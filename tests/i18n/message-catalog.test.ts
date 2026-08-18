import { describe, expect, it } from "vitest";

import ar from "../../messages/ar.json";
import en from "../../messages/en.json";

function messageKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [prefix];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    messageKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("message catalogs", () => {
  it("keeps English and Arabic message paths aligned", () => {
    expect(messageKeys(ar).sort()).toEqual(messageKeys(en).sort());
  });

  it("defines the room presence accessibility label", () => {
    expect(en.room.presence.watchersAria).toContain("{count}");
    expect(ar.room.presence.watchersAria).toContain("{count}");
  });
});
