// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_THEME, isTheme } from "../../src/theme/config";
import { ThemeSwitcher } from "../../src/theme/theme-switcher";
import { I18nHarness } from "../setup-i18n";

afterEach(cleanup);

describe("theme", () => {
  it("defaults to dark and only accepts light or dark", () => {
    expect(DEFAULT_THEME).toBe("dark");
    expect(isTheme("light")).toBe(true);
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("system")).toBe(false);
  });

  it("toggles the document theme from the switcher", () => {
    render(
      <I18nHarness>
        <ThemeSwitcher />
      </I18nHarness>,
    );

    fireEvent.click(screen.getByRole("button", { name: /switch to light mode/i }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");

    fireEvent.click(screen.getByRole("button", { name: /switch to dark mode/i }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
