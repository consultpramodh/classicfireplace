/*
 * 019_App_Frame.tsx
 * Shared shell for all pages. Integrations remain server-side in route/page modules.
 */

import { Sidebar } from "@/components/sidebar";
import { WorkspaceNav } from "@/components/workspace-nav";

export function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <WorkspaceNav />
        {children}
      </main>
    </div>
  );
}
