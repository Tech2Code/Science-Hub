import { useSession } from "next-auth/react";

/**
 * Returns true if the current user can create/edit/delete business data.
 * Managers are read-only — they can view but not mutate.
 */
export function useCanWrite(): boolean {
  const { data: session, status } = useSession();
  // While the session is still resolving, `role` is undefined and
  // `undefined !== "manager"` is true — without this check, a manager would
  // briefly see write-action buttons enabled on initial page load, only for
  // them to flip to disabled (or 403 if clicked in that window) once the
  // real session resolves. Server-side requireWriteAccess() already blocks
  // the mutation either way; this only fixes the misleading transient UI.
  if (status === "loading") return false;
  const role = session?.user?.role;
  // Admin and staff can write, managers cannot
  return role !== "manager";
}
