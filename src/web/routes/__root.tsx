import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toast";
import { VerificationFeedbackProvider } from "@/components/verification/verification-feedback";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Root,
  notFoundComponent: () => <div className="py-20 text-center"><h1 className="text-2xl font-semibold">Page not found</h1><Link to="/" className="mt-4 inline-block underline">Back to ProofFlow</Link></div>,
  errorComponent: () => <p role="alert" className="p-8">This page could not be loaded. Please refresh and try again.</p>,
});

function Root() {
  return (
    <Toaster timeout={4000} limit={3}><VerificationFeedbackProvider><TooltipProvider><div className="min-h-screen bg-background">
      <a href="#main-content" className="sr-only z-50 rounded-lg bg-primary p-3 text-primary-foreground focus:not-sr-only focus:absolute focus:left-4 focus:top-4">Skip to workspace</a>
      <Outlet />
    </div></TooltipProvider></VerificationFeedbackProvider></Toaster>
  );
}
