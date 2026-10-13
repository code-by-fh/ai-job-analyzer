import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { ToastProvider } from "@/ui/ToastProvider";
import { UnsavedChangesProvider } from "@/ui/UnsavedChanges";

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

/**
 * Renders with the app's providers. A fresh query client per test keeps tests independent; pass
 * one to pre-seed the cache.
 */
export function renderWithProviders(ui: ReactElement, queryClient = createTestQueryClient()) {
  const result = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <UnsavedChangesProvider>{ui}</UnsavedChangesProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { queryClient, ...result };
}
