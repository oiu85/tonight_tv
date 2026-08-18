"use client";

/**
 * Polished language switcher used in the entry, login, admin, and room
 * top bars. Renders a flag-free, two-letter code chip ("EN" / "عر") that
 * opens a small menu listing every supported locale. The trigger respects
 * the active locale's writing direction: Arabic shows its native script
 * on the chip, English shows the language code.
 */

import { Check, ChevronDown, Languages } from "lucide-react";

import { cx } from "@/components/primitives/cx";
import { Menu, MenuLabel } from "@/components/primitives/menu";
import { useLocale, useTranslations } from "./locale-provider";

const SHORT_CODE: Record<string, string> = {
  en: "EN",
  ar: "عر",
};

export interface LocaleSwitcherProps {
  /** Visual density: `full` (default) shows a label; `compact` shows only the icon. */
  variant?: "full" | "compact";
  className?: string;
}

export function LocaleSwitcher({ variant = "full", className }: LocaleSwitcherProps) {
  const { locale, setLocale, availableLocales } = useLocale();
  const t = useTranslations("locale");

  const active = availableLocales.find((entry) => entry.code === locale);
  const chip = SHORT_CODE[locale] ?? locale.toUpperCase();

  return (
    <Menu
      label={t("switcher")}
      align="end"
      trigger={({ toggle, isOpen }) => (
        <button
          type="button"
          className={cx("tt-locale-switcher", `tt-locale-switcher--${variant}`, isOpen && "is-open", className)}
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label={t("switcher")}
          title={t("switcher")}
        >
          <span className="tt-locale-switcher__icon" aria-hidden>
            <Languages size={16} strokeWidth={1.75} />
          </span>
          {variant === "full" ? (
            <>
              <span className="tt-locale-switcher__label">{t("switcher")}</span>
              <span className="tt-locale-switcher__chip" aria-hidden>
                {chip}
              </span>
            </>
          ) : (
            <span className="tt-locale-switcher__chip" aria-hidden>
              {chip}
            </span>
          )}
          <span className="tt-locale-switcher__caret" aria-hidden>
            <ChevronDown size={14} strokeWidth={2} />
          </span>
        </button>
      )}
    >
      <MenuLabel>{t("switcher")}</MenuLabel>
      {availableLocales.map((entry) => {
        const isActive = entry.code === locale;
        return (
          <button
            key={entry.code}
            type="button"
            role="menuitemradio"
            aria-checked={isActive}
            className={cx("tt-locale-menu-item", isActive && "is-active")}
            onClick={() => setLocale(entry.code)}
            dir={entry.direction}
            lang={entry.intl}
          >
            <span className="tt-locale-menu-item__native">{entry.nativeLabel}</span>
            <span className="tt-locale-menu-item__label">{entry.label}</span>
            {isActive ? <Check size={14} strokeWidth={2.25} aria-hidden className="tt-locale-menu-item__check" /> : null}
            {!isActive && active ? (
              <span className="tt-locale-menu-item__spacer" aria-hidden />
            ) : null}
          </button>
        );
      })}
    </Menu>
  );
}
