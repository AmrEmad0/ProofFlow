import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import { ScanLine } from "lucide-react";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Root,
  notFoundComponent: () => <div className="py-20 text-center"><h1 className="text-2xl font-semibold">Page not found</h1><Link to="/" className="mt-4 inline-block underline">Back to ProofFlow</Link></div>,
  errorComponent: () => <p role="alert" className="p-8">This page could not be loaded. Please refresh and try again.</p>,
});

function Root() {
  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight"><ScanLine className="size-5" aria-hidden="true" />ProofFlow</Link>
          <span className="text-xs text-muted-foreground">Video evidence, with context</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-12"><Outlet /></main>
    </div>
  );
}
