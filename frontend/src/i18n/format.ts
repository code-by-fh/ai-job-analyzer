const PLACEHOLDER = /\{(\w+)\}/g;

export type MessageVars = Readonly<Record<string, string | number>>;

/** Replaces every {name}; an unknown name stays visible so a missing variable is noticed. */
export function formatMessage(template: string, vars: MessageVars = {}): string {
  return template.replace(PLACEHOLDER, (match, name: string) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : match,
  );
}

export function placeholdersOf(template: string): string[] {
  return Array.from(template.matchAll(PLACEHOLDER), (match) => match[1]).sort();
}
