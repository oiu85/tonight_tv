// @vitest-environment jsdom

// Smoke test for the i18n stack: ensures that the LocaleProvider exposes
// useTranslations() correctly and that the locale switcher actually flips
// the active language and writes the cookie. This guards against the
// easy regressions where someone removes the LocaleProvider from layout.tsx
// or breaks the cookie round-trip.

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LocaleProvider, LocaleSwitcher, useLocale, useTranslations } from "../../src/i18n";
import en from "../../messages/en.json";
import ar from "../../messages/ar.json";

afterEach(cleanup);

describe("LocaleProvider + LocaleSwitcher", () => {
  it("returns English copy by default and lets consumers switch to Arabic", async () => {
    let activeLocale = "en";
    let observed: string | null = null;

    function Probe() {
      const t = useTranslations("entry");
      const { locale, setLocale } = useLocale();
      observed = t("heroTitle");
      activeLocale = locale;
      return (
        <>
          <span data-testid="probe">{observed}</span>
          <button type="button" onClick={() => setLocale("ar")} data-testid="force-ar">force ar</button>
        </>
      );
    }

    const view = render(
      <LocaleProvider initialLocale="en" initialMessages={en as never}>
        <Probe />
        <LocaleSwitcher />
      </LocaleProvider>,
    );

    // English copy on first render.
    expect(view.getByTestId("probe").textContent).toBe("Tonight TV");
    expect(activeLocale).toBe("en");

    // Exercise the same menu interaction used by the rendered application.
    fireEvent.click(view.getByRole("button", { name: "Language" }));
    expect(view.getByRole("menu")).toBeTruthy();
    fireEvent.click(view.getByRole("menuitemradio", { name: /العربية/ }));

    await waitFor(() => expect(activeLocale).toBe("ar"));
    expect(observed).toBe("تونايت تي في");
    // Cookie persisted.
    expect(document.cookie).toMatch(/tt-locale=ar/);
  });

  it("exposes the Arabic bundle as the source of truth when initialised with ar", () => {
    let observed: string | null = null;
    function Probe() {
      const t = useTranslations("entry");
      observed = t("heroTitle");
      return null;
    }
    render(
      <LocaleProvider initialLocale="ar" initialMessages={ar as never}>
        <Probe />
      </LocaleProvider>,
    );
    expect(observed).toBe("تونايت تي في");
  });
});
