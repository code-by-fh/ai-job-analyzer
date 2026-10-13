import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useImportToast } from "@/features/shell/useImportToast";
import type { ImportResult } from "@/realtime/imports";
import { renderWithProviders } from "../../support/render";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: navigation.push }) }));

beforeEach(() => navigation.push.mockReset());

function Harness({ result }: { result: ImportResult }) {
  const show = useImportToast();
  return (
    <button type="button" onClick={() => show(result)}>
      go
    </button>
  );
}

async function finish(result: ImportResult) {
  renderWithProviders(<Harness result={result} />);
  await userEvent.click(screen.getByRole("button", { name: "go" }));
}

describe("useImportToast", () => {
  it("announces an imported job and opens it", async () => {
    await finish({ outcome: "imported", jobId: "job-30", score: 80, archived: false });
    expect(await screen.findByText("Importiert und bewertet: 80 · Stark.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ansehen" }));
    expect(navigation.push).toHaveBeenCalledWith("/jobs/job-30");
  });

  it("says when the job landed below the threshold", async () => {
    await finish({ outcome: "imported", jobId: "job-30", score: 54, archived: true });
    expect(
      await screen.findByText(
        "Importiert: 54 · Schwach, unter deinem Schwellwert. Du findest die Stelle unter „Unter Schwellwert“.",
      ),
    ).toBeInTheDocument();
  });

  it("links a duplicate to the job that is already there", async () => {
    await finish({ outcome: "exists", jobId: "job-1", score: null, archived: false });
    expect(await screen.findByText("Diese Stelle ist schon da.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ansehen" }));
    expect(navigation.push).toHaveBeenCalledWith("/jobs/job-1");
  });

  it("reports a failure as an error without an action", async () => {
    await finish({ outcome: "failed", jobId: null, score: null, archived: false });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Die Anzeige konnte nicht gelesen werden.",
    );
    expect(screen.queryByRole("button", { name: "Ansehen" })).not.toBeInTheDocument();
  });
});
