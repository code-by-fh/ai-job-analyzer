import { de, type MessageKey } from "./de";
import { en } from "./en";
import { formatMessage, type MessageVars } from "./format";
import type { Language } from "./languages";

export type Translate = (key: MessageKey, vars?: MessageVars) => string;

export const DICTIONARIES: Readonly<Record<Language, Readonly<Record<MessageKey, string>>>> = {
  de,
  en,
};

export function translate(language: Language, key: MessageKey, vars?: MessageVars): string {
  return formatMessage(DICTIONARIES[language][key], vars);
}

export function translatorFor(language: Language): Translate {
  return (key, vars) => translate(language, key, vars);
}
