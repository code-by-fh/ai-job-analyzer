"use client";

import { Check, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import type { MessageKey } from "@/i18n/de";
import { LANGUAGES, type Language } from "@/i18n/languages";
import { useI18n } from "@/i18n/useI18n";
import { THEME_PREFERENCES, type ThemePreference } from "@/theme/theme";
import { useTheme } from "@/theme/useTheme";
import { Icon } from "@/ui/Icon";
import { Seg } from "@/ui/Seg";
import { useLanguageSwitch } from "./useLanguageSwitch";

export const THEME_ICON: Record<ThemePreference, LucideIcon> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};
export const THEME_LABEL: Record<ThemePreference, MessageKey> = {
  light: "theme.light",
  dark: "theme.dark",
  system: "theme.system",
};
const LANGUAGE_LABEL: Record<Language, MessageKey> = { de: "language.de", en: "language.en" };

interface OptionItemProps {
  pressed: boolean;
  label: string;
  onSelect: () => void;
  icon?: LucideIcon;
}

function OptionItem({ pressed, label, onSelect, icon }: OptionItemProps) {
  return (
    <button type="button" className="pop-item" aria-pressed={pressed} onClick={onSelect}>
      {icon ? <Icon icon={icon} /> : null}
      {label}
      {pressed ? <Icon icon={Check} className="pop-check" /> : null}
    </button>
  );
}

/** Popover list of the user menu. */
export function LanguageOptions() {
  const { t, language } = useI18n();
  const switchLanguage = useLanguageSwitch();
  return (
    <div role="group" aria-label={t("language.label")}>
      <div className="meta faint pop-caption">{t("language.label")}</div>
      {LANGUAGES.map((option) => (
        <OptionItem
          key={option}
          pressed={option === language}
          label={t(LANGUAGE_LABEL[option])}
          onSelect={() => switchLanguage(option)}
        />
      ))}
    </div>
  );
}

export function ThemeOptions() {
  const { t } = useI18n();
  const { preference, setPreference } = useTheme();
  return (
    <div role="group" aria-label={t("theme.label")}>
      <div className="meta faint pop-caption">{t("theme.label")}</div>
      {THEME_PREFERENCES.map((option) => (
        <OptionItem
          key={option}
          pressed={option === preference}
          label={t(THEME_LABEL[option])}
          icon={THEME_ICON[option]}
          onSelect={() => setPreference(option)}
        />
      ))}
    </div>
  );
}

/** Segmented versions for the mobile "Mehr" sheet, as in the prototype. */
export function PreferenceSegs() {
  return (
    <div className="flex flex-col gap-3">
      <ThemeSeg />
      <LanguageSeg />
    </div>
  );
}

function ThemeSeg() {
  const { t } = useI18n();
  const { preference, setPreference } = useTheme();
  const options = THEME_PREFERENCES.map((value) => ({ value, label: t(THEME_LABEL[value]) }));
  return (
    <Seg options={options} value={preference} onChange={setPreference} label={t("theme.label")} />
  );
}

function LanguageSeg() {
  const { t, language } = useI18n();
  const switchLanguage = useLanguageSwitch();
  const options = LANGUAGES.map((value) => ({ value, label: t(LANGUAGE_LABEL[value]) }));
  return (
    <Seg options={options} value={language} onChange={switchLanguage} label={t("language.label")} />
  );
}
