"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { createQueryClient } from "./queryClient";

export function QueryProvider({ children }: { children: ReactNode }) {
  // One client per browser tab; useState keeps it stable across re-renders.
  const [client] = useState(createQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
