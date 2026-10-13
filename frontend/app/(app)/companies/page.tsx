import { Suspense } from "react";
import { CompaniesPage } from "@/features/companies/CompaniesPage";

export default function CompaniesRoute() {
  // The open company and the search live in the query string (useSearchParams): needs Suspense.
  return (
    <Suspense>
      <CompaniesPage />
    </Suspense>
  );
}
