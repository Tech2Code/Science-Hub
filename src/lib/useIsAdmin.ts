import { useSession } from "next-auth/react";

/** Returns true only for the admin role. Mirrors useCanWrite()'s loading-state handling. */
export function useIsAdmin(): boolean {
  const { data: session, status } = useSession();
  if (status === "loading") return false;
  return session?.user?.role === "admin";
}
