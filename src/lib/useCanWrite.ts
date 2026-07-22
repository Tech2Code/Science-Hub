import { useSession } from "next-auth/react";

/**
 * Returns true if the current user can create/edit/delete business data.
 * Managers are read-only — they can view but not mutate.
 */
export function useCanWrite(): boolean {
  const { data: session } = useSession();
  const role = session?.user?.role;
  // Admin and staff can write, managers cannot
  return role !== "manager";
}
