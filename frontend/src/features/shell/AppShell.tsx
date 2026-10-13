"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { CurrentUser } from "@/api/auth";
import { ApiError } from "@/api/errors";
import { PageSkeleton } from "@/ui/Skeleton";
import { UnsavedChangesProvider } from "@/ui/UnsavedChanges";
import { BottomBar } from "./BottomBar";
import { GlobalSearch } from "./GlobalSearch";
import { PageError } from "./PageError";
import { RealtimeProvider } from "./RealtimeProvider";
import { Sidebar } from "./Sidebar";
import { useCurrentUser } from "./useCurrentUser";
import { useServerLanguageSync } from "./useServerLanguageSync";

/** Frame of every signed-in page: sidebar (desktop), bottom bar (mobile), global search. */
export function AppShell({ children }: { children: ReactNode }) {
  const session = useCurrentUser();
  return (
    <UnsavedChangesProvider>
      <div className="app">
        <Sidebar user={session.data} />
        {/* -1: the landing point when focus has nowhere else to go (toast focus return). */}
        <main className="main" id="main" tabIndex={-1}>
          <ShellContent session={session}>{children}</ShellContent>
        </main>
        <BottomBar signedIn={session.isSuccess} />
        <GlobalSearch />
      </div>
    </UnsavedChangesProvider>
  );
}

const isAuthError = (error: unknown) =>
  error instanceof ApiError && error.code === "UNAUTHENTICATED";

function ShellContent({
  session,
  children,
}: {
  session: UseQueryResult<CurrentUser>;
  children: ReactNode;
}) {
  if (session.data) return <SignedIn user={session.data}>{children}</SignedIn>;
  // An expired session is already redirecting to /login; keep the skeleton instead of flashing an error.
  if (session.isError && !isAuthError(session.error)) {
    return <PageError error={session.error} onRetry={() => void session.refetch()} />;
  }
  return <PageSkeleton />;
}

function SignedIn({ user, children }: { user: CurrentUser; children: ReactNode }) {
  useServerLanguageSync();
  return <RealtimeProvider userId={user.id}>{children}</RealtimeProvider>;
}
