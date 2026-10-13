"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { ErrorMessageOverrides } from "@/api/describeError";
import { givenUp } from "@/api/queryState";
import { ListError, ListLoading } from "@/features/inbox/InboxList";

interface SectionStateProps<T> {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
  /** Passed to describeError for the failed request's sentence. */
  errorText?: ErrorMessageOverrides;
}

/** Loading, then the data; a request that failed or is being retried shows its error (RB13). */
export function SectionState<T>({ query, children, errorText }: SectionStateProps<T>) {
  if (query.data !== undefined) return children(query.data);
  if (givenUp(query))
    return (
      <ListError error={query.error} onRetry={() => void query.refetch()} overrides={errorText} />
    );
  return <ListLoading stalled={false} />;
}
