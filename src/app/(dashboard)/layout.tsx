import { DashboardShell } from "@/components/layout/DashboardShell";
import { PdfRenderProvider } from "@/components/pdf/PdfRenderProvider";

export default function Layout({ children }: { children: React.ReactNode }) {
  // PdfRenderProvider sits above the shell so a bulk PDF/ZIP download keeps running — and its progress card keeps
  // showing — when the user navigates between dashboard pages.
  return (
    <PdfRenderProvider>
      <DashboardShell>{children}</DashboardShell>
    </PdfRenderProvider>
  );
}
