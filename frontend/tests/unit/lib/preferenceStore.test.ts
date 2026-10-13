import { describe, expect, it, vi } from "vitest";
import { createPreferenceStore } from "@/lib/preferenceStore";

const COLORS = ["red", "blue"] as const;
type Color = (typeof COLORS)[number];
const STORAGE_KEY = "test-color";
const isColor = (value: string): value is Color => (COLORS as readonly string[]).includes(value);

function createColorStore() {
  return createPreferenceStore<Color>({
    key: STORAGE_KEY,
    isValid: isColor,
    fallback: () => "red",
  });
}

describe("createPreferenceStore", () => {
  it("returns the fallback when nothing is stored", () => {
    expect(createColorStore().get()).toBe("red");
  });

  it("returns a valid stored value", () => {
    localStorage.setItem(STORAGE_KEY, "blue");
    expect(createColorStore().get()).toBe("blue");
  });

  it("ignores an invalid stored value", () => {
    localStorage.setItem(STORAGE_KEY, "green");
    expect(createColorStore().get()).toBe("red");
  });

  it("persists a new value and notifies subscribers", () => {
    const store = createColorStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.set("blue");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("blue");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stops notifying after unsubscribe", () => {
    const store = createColorStore();
    const listener = vi.fn();
    store.subscribe(listener)();
    store.set("blue");
    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps the choice for this tab when storage is blocked", () => {
    const blocked = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);
    const store = createColorStore();
    store.set("blue");
    expect(store.get()).toBe("blue");
  });
});
