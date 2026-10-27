import { Elysia } from "elysia";
import { packproofTemplate } from "../../shared/packproof";

export const templateRoutes = new Elysia()
  .get("/api/templates/packproof", () => packproofTemplate);
