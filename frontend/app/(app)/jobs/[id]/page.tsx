import { Suspense } from "react";
import { JobPage } from "@/features/job/JobPage";

export default async function JobRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // JobTabs reads the query string (useSearchParams), which needs a Suspense boundary.
  return (
    <Suspense>
      <JobPage jobId={id} />
    </Suspense>
  );
}
