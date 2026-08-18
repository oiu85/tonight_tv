"use client";

import { Moon, Sun } from "lucide-react";

import { IconButton } from "@/components/primitives";
import { useTranslations } from "@/i18n";
import { useTheme } from "./theme-provider";

export function ThemeSwitcher() {
  const { theme, toggleTheme } = useTheme();
  const t = useTranslations("theme");
  return (
    <IconButton
      variant="ghost"
      className="tt-theme-switcher"
      label={theme === "dark" ? t("switchToLight") : t("switchToDark")}
      onClick={toggleTheme}
    >
      {theme === "dark" ? <Sun size={15} aria-hidden /> : <Moon size={15} aria-hidden />}
    </IconButton>
  );
}
