import { useSession } from "next-auth/react";
import type { ProtectedSection } from "@/lib/sections";

/**
 * Returns true if the current user can open a section-gated page/API (admin always can).
 * Client-side mirror of requireSectionAccess(); mirrors useCanWrite()'s loading-state handling.
 */
export function useHasSection(section: ProtectedSection): boolean {
  const { data: session, status } = useSession();
  if (status === "loading") return false;
  if (session?.user?.role === "admin") return true;
  const sections = Array.isArray(session?.user?.sections) ? session.user.sections : [];
  return sections.includes(section);
}
