import { describe, expect, it } from "vitest";
import { ApiError, errorFromResponse } from "@/api/errors";
import { fieldErrorsFrom } from "@/api/fieldErrors";

const validation = (...fields: string[][]) =>
  errorFromResponse(422, { detail: fields.map((loc) => ({ loc: ["body", ...loc], msg: "x" })) });
const DOMAIN_ONLY = (field: string) => (field === "company_domain" ? "domain" : null);

describe("fieldErrorsFrom", () => {
  it("names the form fields of a 422 that the map knows", () => {
    const error = validation(["company_domain"], ["unknown_field"]);
    expect(fieldErrorsFrom(error, DOMAIN_ONLY)).toEqual(["domain"]);
  });

  it("is empty for any other error", () => {
    expect(fieldErrorsFrom(errorFromResponse(500, {}), DOMAIN_ONLY)).toEqual([]);
    expect(fieldErrorsFrom(new Error("boom"), DOMAIN_ONLY)).toEqual([]);
    const plain = new ApiError({ status: 400, code: "BAD_REQUEST", message: "x" });
    expect(fieldErrorsFrom(plain, DOMAIN_ONLY)).toEqual([]);
  });

  it("names each form field once", () => {
    const error = validation(["salary_benchmark", "max"], ["salary_benchmark", "min"]);
    expect(fieldErrorsFrom(error, () => "salary")).toEqual(["salary"]);
  });
});
