import { Suspense } from "react";
import { SettingsPage } from "@/features/settings/SettingsPage";

export default function SettingsRoute() {
  // The open section lives in the query string (useSearchParams): needs Suspense.
  return (
    <Suspense>
      <SettingsPage />
    </Suspense>
  );
}
