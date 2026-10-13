import { describe, expect, it } from "vitest";
import { NOTIFICATION_LIMITS } from "@/api/settingsPaths";
import {
  canEdit,
  kindOfType,
  scopeOf,
  templateDraftOf,
  templateProblems,
  typeOfKind,
} from "@/features/settings/notifications/templates/templateDraft";

const OWN = { id: 1, name: "Kurz", type: "PUSHOVER", content: "$title", is_admin: false };
const GLOBAL = { id: 2, name: "Digest", type: "MAILJET", content: "<p/>", is_admin: true };
// One code point, two UTF-16 units: the server (pydantic) counts it once.
const ASTRAL = "\u{1F600}";
const empty = templateDraftOf(null);

describe("template drafts", () => {
  it("map every email type to the email kind and create email as RESEND", () => {
    expect(kindOfType("MAILJET")).toBe("email");
    expect(kindOfType("SMTP")).toBe("email");
    expect(kindOfType("PUSHOVER")).toBe("push");
    expect(typeOfKind("email")).toBe("RESEND");
    expect(typeOfKind("push")).toBe("PUSHOVER");
  });

  it("start a new draft as an email of the user's own and copy a stored one", () => {
    expect(empty).toEqual({ name: "", kind: "email", content: "", global: false });
    expect(templateDraftOf(GLOBAL)).toEqual({
      name: "Digest",
      kind: "email",
      content: "<p/>",
      global: true,
    });
  });

  it("let members edit their own templates, admins also global ones", () => {
    expect(canEdit(OWN, false)).toBe(true);
    expect(canEdit(GLOBAL, false)).toBe(false);
    expect(canEdit(GLOBAL, true)).toBe(true);
    expect(scopeOf(OWN)).toBe("own");
    expect(scopeOf(GLOBAL)).toBe("global");
  });

  it("check name and content like the server", () => {
    expect(templateProblems({ ...empty, name: "   ", content: "x" })).toEqual({ name: "required" });
    expect(templateProblems({ ...empty, name: "n".repeat(101), content: "x" })).toEqual({
      name: "tooLong",
    });
    expect(templateProblems({ ...empty, name: "Ok", content: "" })).toEqual({
      content: "required",
    });
    expect(templateProblems({ ...empty, name: "  Ok  ", content: "x" })).toEqual({});
  });

  it("count code points, not UTF-16 units, as the server does", () => {
    const name = ASTRAL.repeat(NOTIFICATION_LIMITS.templateName);
    const content = ASTRAL.repeat(NOTIFICATION_LIMITS.templateContent);
    expect(templateProblems({ ...empty, name, content })).toEqual({});
    expect(templateProblems({ ...empty, name: `${name}x`, content: `${content}x` })).toEqual({
      name: "tooLong",
      content: "tooLong",
    });
  });

  it("keep the content untrimmed: whitespace alone is a text", () => {
    expect(templateProblems({ ...empty, name: "Ok", content: " " })).toEqual({});
  });
});
