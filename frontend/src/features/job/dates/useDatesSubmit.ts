"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { describeError } from "@/api/describeError";
import { fieldErrorsFrom } from "@/api/fieldErrors";
import { patchJob, type JobDetail, type JobPatch } from "@/api/jobs";
import { useI18n } from "@/i18n/useI18n";
import { useToast } from "@/ui/ToastProvider";
import { refreshJobQueries } from "../jobWrites";
import type { SetForm } from "./BoundField";
import {
  datesFieldOf,
  fieldElementId,
  firstInvalidField,
  formFromJob,
  patchFromForm,
  validateDatesForm,
  type DatesField,
  type DatesForm,
  type DatesProblems,
} from "./datesForm";

/** Shows the problems and focuses the first invalid control. */
function useProblems() {
  const [problems, setProblems] = useState<DatesProblems>({});
  const show = (found: DatesProblems) => {
    setProblems(found);
    const first = firstInvalidField(found);
    if (first) document.getElementById(fieldElementId(first))?.focus();
    return first !== null;
  };
  return { problems, show };
}

/** Form state, validation and the PATCH of changed fields only. */
export function useDatesSubmit(job: JobDetail, onClose: () => void) {
  const { t } = useI18n();
  // The snapshot at open time is what "changed" is measured against.
  const [initial] = useState(() => formFromJob(job));
  const [form, setForm] = useState(initial);
  const { problems, show } = useProblems();
  const onRejected = (fields: DatesField[]) =>
    show(Object.fromEntries(fields.map((field) => [field, "rejected"])));
  const save = useSave(job, { onClose, onRejected });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!show(validateDatesForm(form))) save.run(form, initial);
  };
  const error = (field: DatesField) => {
    const problem = problems[field];
    return problem ? t(`dates.problem.${problem}`) : undefined;
  };
  return { form, setForm: setForm as SetForm, submit, error, saving: save.saving };
}

interface SaveHandlers {
  onClose: () => void;
  /** A 422 named form fields (spec 6): they are shown on the fields, not as a toast. */
  onRejected: (fields: DatesField[]) => void;
}

function useSaveMutation(job: JobDetail, { onClose, onRejected }: SaveHandlers) {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changes: JobPatch) => patchJob(job.id, changes),
    onSuccess: () => {
      refreshJobQueries(queryClient, job.id);
      toast.show({ message: t("dates.saved") });
      onClose();
    },
    onError: (error) => {
      const fields = fieldErrorsFrom(error, datesFieldOf);
      if (fields.length > 0) return onRejected(fields);
      toast.show({ tone: "error", message: describeError(error, t) });
    },
  });
}

function useSave(job: JobDetail, handlers: SaveHandlers) {
  const mutation = useSaveMutation(job, handlers);
  const run = (form: DatesForm, initial: DatesForm) => {
    const changes = patchFromForm(form, initial);
    if (Object.keys(changes).length === 0) return handlers.onClose();
    mutation.mutate(changes);
  };
  return { run, saving: mutation.isPending };
}
