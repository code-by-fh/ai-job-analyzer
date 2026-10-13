"use client";

import type { JobDetail } from "@/api/jobs";
import { phaseOf } from "@/domain/jobStatus";
import type { NextStep, NextStepKind } from "@/domain/nextStep";
import { ApplyChecklist } from "./ApplyChecklist";
import { ApplyWithoutDocuments } from "./ApplyWithoutDocuments";

const CHECKLIST_KINDS: ReadonlySet<NextStepKind> = new Set<NextStepKind>(["apply", "markApplied"]);
const NOT_READY_KINDS: ReadonlySet<NextStepKind> = new Set<NextStepKind>([
  "createDocuments",
  "createCv",
  "createLetter",
  "generating",
  "generationFailed",
]);

export function NextStepExtras({ job, step }: { job: JobDetail; step: NextStep }) {
  if (CHECKLIST_KINDS.has(step.kind)) return <ApplyChecklist job={job} />;
  if (NOT_READY_KINDS.has(step.kind) && phaseOf(job) === "DRAFTED")
    return <ApplyWithoutDocuments job={job} />;
  return null;
}
