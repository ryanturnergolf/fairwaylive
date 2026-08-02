import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const nextCli = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const inheritedNodeOptions = process.env.NODE_OPTIONS?.trim() ?? "";
const systemCaOption = "--use-system-ca";
const nodeOptions = inheritedNodeOptions
  .split(/\s+/)
  .filter(Boolean);

if (!nodeOptions.includes(systemCaOption)) {
  nodeOptions.push(systemCaOption);
}

const child = spawn(process.execPath, [nextCli, "dev", ...process.argv.slice(2)], {
  env: {
    ...process.env,
    NODE_OPTIONS: nodeOptions.join(" "),
  },
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(`Unable to start the local development server: ${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
