import { Suspense } from "react";
import { ApplicationsPage } from "@/features/applications/ApplicationsPage";

export default function ApplicationsRoute() {
  // Search, phase and the closed section live in the query string (useSearchParams): needs Suspense.
  return (
    <Suspense>
      <ApplicationsPage />
    </Suspense>
  );
}
