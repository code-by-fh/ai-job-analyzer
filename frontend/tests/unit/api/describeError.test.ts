import { describe, expect, it } from "vitest";
import { describeError } from "@/api/describeError";
import { ApiError } from "@/api/errors";
import { translatorFor } from "@/i18n/translate";

const t = translatorFor("de");
const apiError = (code: ApiError["code"], message = "") =>
  new ApiError({ status: 500, code, message });

describe("describeError", () => {
  it("never shows the text of a server error", () => {
    const text = describeError(apiError("SERVER_ERROR", "Internal server error"), t);
    expect(text).toBe(
      "Der Server hat einen Fehler gemeldet. Bitte versuche es gleich noch einmal.",
    );
  });

  it("treats a malformed response like a server error", () => {
    expect(describeError(apiError("BAD_RESPONSE"), t)).toBe(t("error.server"));
  });

  it("asks the user to wait on rate limits", () => {
    expect(describeError(apiError("RATE_LIMITED"), t)).toBe(
      "Zu viele Anfragen, bitte kurz warten.",
    );
  });

  it("names a missing connection", () => {
    expect(describeError(apiError("NETWORK_ERROR"), t)).toBe("Keine Verbindung zum Server.");
  });

  it.each([
    ["NOT_FOUND", "error.notFound"],
    ["BAD_REQUEST", "error.unexpected"],
    ["VALIDATION_ERROR", "error.invalidInput"],
    ["UPSTREAM_ERROR", "error.upstream"],
    ["PAYLOAD_TOO_LARGE", "error.tooLarge"],
    ["UNSUPPORTED_MEDIA_TYPE", "error.unsupportedType"],
    ["FORBIDDEN", "error.forbidden"],
    ["CONFLICT", "error.conflict"],
  ] as const)("describes %s generically and hides the server text", (code, key) => {
    const text = describeError(apiError(code, "raw server detail"), t);
    expect(text).toBe(t(key));
    expect(text).not.toContain("raw server detail");
  });

  it("lets a caller opt in to a specific message per code", () => {
    const text = describeError(apiError("BAD_REQUEST", "Nur PDF Dateien erlaubt."), t, {
      BAD_REQUEST: "error.unsupportedType",
    });
    expect(text).toBe(t("error.unsupportedType"));
  });

  it("handles values that are not ApiErrors", () => {
    expect(describeError(new Error("boom"), t)).toBe(t("error.unexpected"));
  });
});
