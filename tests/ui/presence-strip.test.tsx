// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import { PresenceStrip } from "../../src/components/room/components/presence-strip";
import { LocaleProvider } from "../../src/i18n";

afterEach(cleanup);

describe("PresenceStrip", () => {
  it("renders a translated, counted region label", () => {
    const view = render(
      <LocaleProvider initialLocale="en" initialMessages={en as never}>
        <PresenceStrip watchers={[]} ownerUserId="owner" />
      </LocaleProvider>,
    );

    expect(view.getByRole("region", { name: "0 watching" })).toBeTruthy();
  });
});
