import type { JobTodo } from "@/api/jobs";

// Server limits (database/core.py JobPatchRequest / JobTodo); checked here so the user gets a sentence, not a 422.
export const MAX_TODOS = 50;
export const MAX_TODO_TEXT_LENGTH = 500;
export const MAX_TODO_ID_LENGTH = 64;

export type TodoProblem = "empty" | "tooLong" | "tooMany" | "badId";
export type TodoResult = { ok: true; todos: JobTodo[] } | { ok: false; problem: TodoProblem };

/** `id` is injected (crypto.randomUUID in the UI) so this stays pure. */
export function addTodo(todos: readonly JobTodo[], text: string, id: string): TodoResult {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, problem: "empty" };
  if (trimmed.length > MAX_TODO_TEXT_LENGTH) return { ok: false, problem: "tooLong" };
  if (!isValidId(todos, id)) return { ok: false, problem: "badId" };
  if (todos.length >= MAX_TODOS) return { ok: false, problem: "tooMany" };
  return { ok: true, todos: [...todos, { id, text: trimmed, done: false }] };
}

function isValidId(todos: readonly JobTodo[], id: string): boolean {
  return id !== "" && id.length <= MAX_TODO_ID_LENGTH && !todos.some((todo) => todo.id === id);
}

export function toggleTodo(todos: readonly JobTodo[], id: string): JobTodo[] {
  return todos.map((todo) => (todo.id === id ? { ...todo, done: !todo.done } : todo));
}

export function removeTodo(todos: readonly JobTodo[], id: string): JobTodo[] {
  return todos.filter((todo) => todo.id !== id);
}
