import { useSession } from "next-auth/react";

/**
 * Returns true if the current user can create/edit/delete business data.
 * Managers are read-only — they can view but not mutate.
 */
export function useCanWrite(): boolean {
  const { data: session, status } = useSession();
  // While loading, `role` is undefined so `undefined !== "manager"` is true — without this check a
  // manager would briefly see write buttons enabled. requireWriteAccess() blocks the mutation regardless.
  if (status === "loading") return false;
  const role = session?.user?.role;
  // Admin and staff can write, managers cannot
  return role !== "manager";
}
