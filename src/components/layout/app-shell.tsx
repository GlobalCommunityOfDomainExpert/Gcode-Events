import { ReactNode } from "react";
import { Footer } from "./footer";

export interface AppShellProps {
  navbar: ReactNode;
  sidebar?: ReactNode;
  /** Desktop (lg+): shrink the sidebar to an icon rail (width animates). Below lg it is always out of the way. */
  sidebarCompact?: boolean;
  children: ReactNode;
}

export function AppShell({
  navbar,
  sidebar,
  sidebarCompact = false,
  children,
}: AppShellProps) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {navbar}
      <div className="flex min-h-0 flex-1">
        {sidebar && (
          <aside
            className={`border-border-light bg-surface-light hidden shrink-0 flex-col overflow-hidden border-r shadow-sm transition-[width] duration-300 ease-out motion-reduce:transition-none lg:flex ${
              sidebarCompact ? "w-21" : "w-72"
            }`}
          >
            {sidebar}
          </aside>
        )}
        <main
          id="app-scroll-region"
          className="relative flex flex-1 flex-col overflow-x-hidden overflow-y-auto"
        >
          <div className="isolate mx-auto w-full max-w-7xl flex-1 px-4 pb-8 sm:px-6 lg:px-8">
            {children}
          </div>
          <Footer />
        </main>
      </div>
    </div>
  );
}
