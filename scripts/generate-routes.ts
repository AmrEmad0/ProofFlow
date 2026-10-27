import { Generator, getConfig } from "@tanstack/router-generator";

const config = getConfig({
  target: "react",
  routesDirectory: "./src/web/routes",
  generatedRouteTree: "./src/web/routeTree.gen.ts",
});
await new Generator({ config, root: process.cwd() }).run();
