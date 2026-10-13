import { describe, expect, it } from "vitest";
import {
  addTodo,
  MAX_TODO_ID_LENGTH,
  MAX_TODO_TEXT_LENGTH,
  MAX_TODOS,
  removeTodo,
  toggleTodo,
} from "@/domain/todos";

const ONE = [{ id: "a", text: "Gehalt recherchieren", done: false }];

describe("addTodo", () => {
  it("appends a trimmed to-do", () => {
    expect(addTodo(ONE, "  Referenz anfragen ", "b")).toEqual({
      ok: true,
      todos: [...ONE, { id: "b", text: "Referenz anfragen", done: false }],
    });
  });

  it("rejects an empty text", () => {
    expect(addTodo(ONE, "   ", "b")).toEqual({ ok: false, problem: "empty" });
  });

  it("rejects a text over the server limit", () => {
    expect(addTodo(ONE, "x".repeat(MAX_TODO_TEXT_LENGTH + 1), "b")).toEqual({
      ok: false,
      problem: "tooLong",
    });
  });

  it.each([
    ["an empty id", ""],
    ["a duplicate id", "a"],
    ["an id over the server limit", "i".repeat(MAX_TODO_ID_LENGTH + 1)],
  ])("rejects %s", (_name, id) => {
    expect(addTodo(ONE, "Neu", id)).toEqual({ ok: false, problem: "badId" });
  });

  it("rejects the 51st to-do", () => {
    const full = Array.from({ length: MAX_TODOS }, (_, index) => ({
      id: String(index),
      text: "t",
      done: false,
    }));
    expect(addTodo(full, "noch eins", "x")).toEqual({ ok: false, problem: "tooMany" });
  });
});

describe("toggleTodo and removeTodo", () => {
  it("toggles one to-do", () => {
    expect(toggleTodo(ONE, "a")).toEqual([{ ...ONE[0], done: true }]);
  });

  it("removes one to-do", () => {
    expect(removeTodo(ONE, "a")).toEqual([]);
  });
});
