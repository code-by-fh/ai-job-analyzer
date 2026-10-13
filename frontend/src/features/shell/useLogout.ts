"use client";

import { useMutation } from "@tanstack/react-query";
import { logout } from "@/api/auth";
import { LOGIN_PATH } from "@/api/session";

export function useLogout(): () => void {
  // onSettled: even if the server is unreachable, the user asked to leave. A full navigation (not
  // router.replace after queryClient.clear()) drops the cache and closes the socket in one step;
  // clearing while the shell is still mounted would refetch /me with dead cookies and end on
  // /login?next=... instead.
  const mutation = useMutation({
    mutationFn: logout,
    onSettled: () => window.location.assign(LOGIN_PATH),
  });
  return () => mutation.mutate();
}
