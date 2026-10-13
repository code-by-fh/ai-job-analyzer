import { Suspense } from "react";
import { ProfilePage } from "@/features/profile/ProfilePage";

export default function ProfileRoute() {
  // The open section lives in the query string (useSearchParams): needs Suspense.
  return (
    <Suspense>
      <ProfilePage />
    </Suspense>
  );
}
