const children = [
  Bun.spawn(["bun", "--watch", "src/server/index.ts"], { stdin: "inherit", stdout: "inherit", stderr: "inherit" }),
  Bun.spawn(["bun", "--bun", "node_modules/vite/bin/vite.js"], { stdin: "inherit", stdout: "inherit", stderr: "inherit" }),
];

function stop() { for (const child of children) child.kill(); }
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
const exitCode = await Promise.race(children.map((child) => child.exited));
stop();
await Promise.all(children.map((child) => child.exited));
process.exit(exitCode);
export {};

