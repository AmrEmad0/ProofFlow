import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import { Package, ScanLine } from "lucide-react";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Root,
  notFoundComponent: () => <div className="py-20 text-center"><h1 className="text-2xl font-semibold">Page not found</h1><Link to="/" className="mt-4 inline-block underline">Back to ProofFlow</Link></div>,
  errorComponent: () => <p role="alert" className="p-8">This page could not be loaded. Please refresh and try again.</p>,
});

function Root() {
  return (
    <div className="min-h-screen bg-background">
      <a href="#main-content" className="sr-only z-50 rounded-lg bg-primary p-3 text-primary-foreground focus:not-sr-only focus:absolute focus:left-4 focus:top-4">Skip to workspace</a>
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-6 sm:gap-10"><Link to="/" className="flex items-center gap-2.5 text-lg font-semibold tracking-tight"><span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><ScanLine className="size-5" strokeWidth={1.75} aria-hidden="true" /></span>ProofFlow</Link>
          </div>
          <nav aria-label="Main navigation"><Link to="/packproof" activeProps={{ className: "text-primary" }} className="flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-primary"><Package className="size-4" aria-hidden="true" />Box packing example</Link></nav>
        </div>
      </header>
      <main id="main-content" className="px-4 pb-8 pt-6 sm:px-8 sm:pt-8"><Outlet /></main>
    </div>
  );
}
