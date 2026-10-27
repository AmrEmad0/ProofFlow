import { treaty } from "@elysia/eden";
import type { App } from "../../server/app";

// Vite proxies /api in development; production serves everything on one origin.
export const api = treaty<App>(window.location.origin);
