import { Suspense } from "react";
import { SourcesPage } from "@/features/sources/SourcesPage";

export default function SourcesRoute() {
  // The open drawer and the wizard live in the query string (useSearchParams): needs Suspense.
  return (
    <Suspense>
      <SourcesPage />
    </Suspense>
  );
}
