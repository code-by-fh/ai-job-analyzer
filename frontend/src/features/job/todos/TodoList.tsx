"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { describeError } from "@/api/describeError";
import { jobQueryOptions, patchJob, type JobDetail, type JobTodo } from "@/api/jobs";
import { queryKeys } from "@/api/queryKeys";
import { addTodo, removeTodo, toggleTodo } from "@/domain/todos";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { CheckField, TextField } from "@/ui/Field";
import { useToast } from "@/ui/ToastProvider";
import { isLastJobWrite, jobWriteKey, jobWriteScope, restoreFields } from "../jobWrites";

interface TodoWrite {
  todos: JobTodo[];
  /** The cached to-dos before the optimistic write. */
  previous: JobDetail["todos"];
}

function useTodoMutation(job: JobDetail) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const toast = useToast();
  return useMutation({
    mutationKey: jobWriteKey(job.id, "todos"),
    scope: jobWriteScope(job.id),
    mutationFn: (write: TodoWrite) => patchJob(job.id, { todos: write.todos }),
    onError: (error, write) => {
      restoreFields(queryClient, job.id, { todos: write.previous });
      toast.show({ tone: "error", message: describeError(error, t) });
    },
    onSettled: () => {
      if (isLastJobWrite(queryClient, job.id)) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.job(job.id) });
      }
    },
  });
}

/**
 * To-dos stored in jobs.todos (B7); every change sends the whole list (PATCH replaces it). The list
 * is rendered from the cached job, which each change updates at once and which is rolled back if
 * the save fails. Changes of one job run in order, and the cache is refetched after the last one.
 */
function useTodos(job: JobDetail) {
  const queryClient = useQueryClient();
  const mutation = useTodoMutation(job);
  const cached = useQuery({ ...jobQueryOptions(job.id), enabled: false }).data ?? job;
  const current = () => queryClient.getQueryData<JobDetail>(queryKeys.job(job.id)) ?? job;
  const save = (todos: JobTodo[]) => {
    const previous = current().todos;
    void queryClient.cancelQueries({ queryKey: queryKeys.job(job.id) });
    queryClient.setQueryData(queryKeys.job(job.id), { ...current(), todos });
    mutation.mutate({ todos, previous });
  };
  return { todos: cached.todos ?? [], latest: () => current().todos ?? [], save };
}

/** Feedback 1 T13: a card of the side column, below "Termine & Daten". */
export function TodoList({ job }: { job: JobDetail }) {
  const { t } = useI18n();
  const { todos, latest, save } = useTodos(job);
  return (
    <section className="jd-card todos" aria-labelledby="todos-title">
      <div className="row-between">
        <h2 className="sec-title-sm" id="todos-title">
          {t("todo.title")}
        </h2>
        <TodoProgress todos={todos} />
      </div>
      <TodoItems todos={todos} latest={latest} onChange={save} />
      <NewTodo latest={latest} onAdd={save} />
    </section>
  );
}

interface TodoItemsProps {
  todos: readonly JobTodo[];
  /** Reads the newest list at click time, so rapid clicks build on each other. */
  latest: () => readonly JobTodo[];
  onChange: (next: JobTodo[]) => void;
}

function TodoItems({ todos, latest, onChange }: TodoItemsProps) {
  return (
    <ul role="list" className="plain-list todo-list">
      {todos.map((todo) => (
        <TodoItem
          key={todo.id}
          todo={todo}
          onToggle={() => onChange(toggleTodo(latest(), todo.id))}
          onRemove={() => onChange(removeTodo(latest(), todo.id))}
        />
      ))}
    </ul>
  );
}

function TodoProgress({ todos }: { todos: readonly JobTodo[] }) {
  const { t } = useI18n();
  if (todos.length === 0) return null;
  const done = todos.filter((todo) => todo.done).length;
  return <span className="meta">{t("todo.progress", { done, total: todos.length })}</span>;
}

interface TodoItemProps {
  todo: JobTodo;
  onToggle: () => void;
  onRemove: () => void;
}

function TodoItem({ todo, onToggle, onRemove }: TodoItemProps) {
  return (
    <li className="todo">
      <CheckField
        id={`todo-${todo.id}`}
        label={todo.text}
        checked={todo.done}
        onChange={onToggle}
      />
      <DeleteTodoButton text={todo.text} onClick={onRemove} />
    </li>
  );
}

function DeleteTodoButton({ text, onClick }: { text: string; onClick: () => void }) {
  const { t } = useI18n();
  return (
    <Button
      size="sm"
      variant="ghost"
      iconOnly
      icon={Trash2}
      aria-label={t("todo.delete", { text })}
      onClick={onClick}
    />
  );
}

interface NewTodoProps {
  latest: () => readonly JobTodo[];
  onAdd: (todos: JobTodo[]) => void;
}

function useNewTodo({ latest, onAdd }: NewTodoProps) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | undefined>();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    // Event handler: generating an id here is fine (not during render).
    const result = addTodo(latest(), text, crypto.randomUUID());
    if (!result.ok) return setError(t(`todo.${result.problem}`));
    setError(undefined);
    setText("");
    onAdd(result.todos);
  };
  return { text, setText, error, submit };
}

function NewTodo(props: NewTodoProps) {
  const { t } = useI18n();
  const form = useNewTodo(props);
  return (
    <form className="todo-new" onSubmit={form.submit}>
      <TextField
        id="todo-new"
        label={t("todo.new")}
        value={form.text}
        error={form.error}
        onChange={(event) => form.setText(event.target.value)}
      />
      <Button type="submit" size="sm" icon={Plus}>
        {t("todo.add")}
      </Button>
    </form>
  );
}
