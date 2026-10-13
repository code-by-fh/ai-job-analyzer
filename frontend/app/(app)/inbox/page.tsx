import { Suspense } from "react";
import { InboxPage } from "@/features/inbox/InboxPage";

export default function InboxRoute() {
  // The inbox reads tab and selection from the query string (useSearchParams): needs Suspense.
  return (
    <Suspense>
      <InboxPage />
    </Suspense>
  );
}
