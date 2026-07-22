"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PermissionManager } from "./PermissionManager";

export default function PermissionsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [status, session, router]);

  if (status === "loading") return <div className="page-stack"><p>Loading…</p></div>;
  if (session?.user?.role !== "admin") return null;

  return (
    <div className="page-stack">
      <PermissionManager />
    </div>
  );
}
