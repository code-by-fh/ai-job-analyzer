import { describe, expect, it } from "vitest";
import { ADMIN_LIMITS } from "@/api/adminPaths";
import { filterModels, isFreeModel } from "@/features/settings/admin/modelFilter";

const FREE = {
  id: "a/free:free",
  name: "A Free",
  context_length: 8000,
  pricing: { prompt: "0", completion: "0" },
};
const PAID = {
  id: "b/paid",
  name: "B Paid",
  context_length: 128000,
  pricing: { prompt: "0.000001", completion: "0.000002" },
};

describe("filterModels", () => {
  it("filters by name or id and by price", () => {
    expect(
      filterModels({ models: [FREE, PAID], query: "paid", freeOnly: false, current: "" }),
    ).toEqual([PAID]);
    expect(filterModels({ models: [FREE, PAID], query: "", freeOnly: true, current: "" })).toEqual([
      FREE,
    ]);
  });
  it("keeps the stored model first even when the filter hides it", () => {
    expect(
      filterModels({ models: [FREE, PAID], query: "free", freeOnly: true, current: "b/paid" })[0],
    ).toEqual(PAID);
  });
  it("treats a model without prices as not free", () => {
    expect(isFreeModel({ ...PAID, pricing: {} })).toBe(false);
  });

  it("matches the id and ignores case and surrounding spaces", () => {
    expect(
      filterModels({ models: [FREE, PAID], query: "  B/PAID ", freeOnly: false, current: "" }),
    ).toEqual([PAID]);
  });

  it("lists the current model once, not again among the matches", () => {
    expect(
      filterModels({ models: [FREE, PAID], query: "", freeOnly: false, current: "b/paid" }),
    ).toEqual([PAID, FREE]);
  });

  it("shows at most modelOptions entries, the current one included", () => {
    const many = Array.from({ length: ADMIN_LIMITS.modelOptions + 5 }, (_, index) => ({
      ...PAID,
      id: `m/${index}`,
    }));
    const current = `m/${ADMIN_LIMITS.modelOptions + 4}`;
    const shown = filterModels({ models: many, query: "", freeOnly: false, current });
    expect(shown).toHaveLength(ADMIN_LIMITS.modelOptions);
    expect(shown[0]?.id).toBe(current);
  });
});

describe("isFreeModel", () => {
  it("is free only when prompt and completion both cost nothing", () => {
    expect(isFreeModel(FREE)).toBe(true);
    expect(isFreeModel({ ...FREE, pricing: { prompt: "0", completion: "0.000001" } })).toBe(false);
    expect(isFreeModel({ ...FREE, pricing: { prompt: "0.0", completion: "0" } })).toBe(true);
    expect(isFreeModel({ ...FREE, pricing: { prompt: "abc", completion: "0" } })).toBe(false);
  });
});
