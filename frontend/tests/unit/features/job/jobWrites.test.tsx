import { useQuery } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { jobQueryOptions, type JobDetail } from "@/api/jobs";
import { queryKeys } from "@/api/queryKeys";
import { TodoList } from "@/features/job/history/TodoList";
import { NextStepCard } from "@/features/job/next/NextStepCard";
import { useChangeStatus } from "@/features/job/phase/useChangeStatus";
import { jsonResponse } from "../../support/fakeFetch";
import { buildJob } from "../../support/jobFactory";
import { renderWithProviders } from "../../support/render";

vi.mock("next/navigation", () => ({
  usePathname: () => "/jobs/job-1",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const READY = { status: "DRAFTED", cv_html_present: true, cover_letter_html_present: true };
const HTTP_SERVER_ERROR = 500;

interface Gate {
  open: (response: Response) => void;
}

/** A fetch whose answers the test hands out; every call waits for its own gate. */
function gatedFetch(answer: (method: string, body: string) => Response | Gate[]) {
  vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    const gates = answer(init?.method ?? "GET", String(init?.body ?? ""));
    if (gates instanceof Response) return gates;
    return new Promise<Response>((resolve) => gates.push({ open: resolve }));
  });
}

describe("optimistic writes of one job", () => {
  it("keeps a pending to-do when a checklist write fails", async () => {
    const job = buildJob(READY);
    const checklistGates: Gate[] = [];
    const todoGates: Gate[] = [];
    gatedFetch((method, body) => {
      if (method !== "PATCH") return jsonResponse(200, method === "GET" ? job : []);
      return body.includes("checklist") ? checklistGates : todoGates;
    });
    const { queryClient } = renderWithProviders(
      <>
        <NextStepCard job={job} />
        <TodoList job={job} />
      </>,
    );
    act(() => queryClient.setQueryData(queryKeys.job(job.id), job));
    await userEvent.click(screen.getByLabelText("Stellenanzeige geöffnet"));
    await userEvent.type(screen.getByLabelText("Neue Aufgabe"), "Gehalt recherchieren{Enter}");
    expect(screen.getByLabelText("Gehalt recherchieren")).toBeInTheDocument();
    await waitFor(() => expect(checklistGates).toHaveLength(1));
    await act(async () => checklistGates[0].open(jsonResponse(HTTP_SERVER_ERROR, {})));
    await waitFor(() => expect(screen.getByLabelText("Stellenanzeige geöffnet")).not.toBeChecked());
    expect(screen.getByLabelText("Gehalt recherchieren")).toBeInTheDocument();
  });
});

function StatusProbe({ job }: { job: JobDetail }) {
  const { changeStatus } = useChangeStatus(job);
  const cached = useQuery(jobQueryOptions(job.id)).data;
  return (
    <>
      <output>{cached?.status}</output>
      <button onClick={() => void changeStatus({ to: "APPLIED" })}>apply</button>
    </>
  );
}

describe("status change", () => {
  it("is not reverted by a slower GET that started before it", async () => {
    const job = buildJob(READY);
    const staleGets: Gate[] = [];
    let gets = 0;
    gatedFetch((method) => {
      if (method === "POST") return jsonResponse(200, { ...job, status: "APPLIED" });
      gets += 1;
      return gets === 1 ? jsonResponse(200, job) : staleGets;
    });
    const { queryClient } = renderWithProviders(<StatusProbe job={job} />);
    expect(await screen.findByText("DRAFTED")).toBeInTheDocument();
    act(() => void queryClient.invalidateQueries({ queryKey: queryKeys.job(job.id) }));
    await waitFor(() => expect(staleGets).toHaveLength(1));
    await userEvent.click(screen.getByRole("button", { name: "apply" }));
    expect(await screen.findByText("APPLIED")).toBeInTheDocument();
    await act(async () => staleGets[0].open(jsonResponse(200, job)));
    await waitFor(() =>
      expect(queryClient.isFetching({ queryKey: queryKeys.job(job.id) })).toBe(0),
    );
    expect(screen.getByText("APPLIED")).toBeInTheDocument();
  });
});
