import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";

const port = 3100;
const serverUrl = `http://127.0.0.1:${port}`;
const startupTimeoutMs = 120_000;
const require = createRequire(import.meta.url);
const playwrightArgs = process.argv.slice(2);
const warmupPaths = [
  "/",
  "/dashboard",
  "/tournament/e2e-tournament",
  "/tournament/readiness-share-tournament",
  "/scorecard/1?tournamentId=e2e-tournament&pairing=1",
];

const spawnNode = (args, options = {}) =>
  spawn(process.execPath, args, {
    cwd: process.cwd(),
    shell: false,
    stdio: "inherit",
    windowsHide: true,
    ...options,
  });

const waitForServer = async () => {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < startupTimeoutMs) {
    try {
      const response = await fetch(serverUrl);
      if (response.ok || response.status < 500) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for ${serverUrl}${lastError ? `: ${lastError.message}` : ""}`);
};

const warmupRoutes = async () => {
  for (const path of warmupPaths) {
    try {
      await fetch(`${serverUrl}${path}`);
    } catch {
      // Individual warmups are best-effort; the actual tests still assert behavior.
    }
  }
};

const waitForExit = (child) =>
  new Promise((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });

const stopServer = async (server) => {
  if (server.exitCode !== null || server.killed) {
    return;
  }

  server.kill("SIGTERM");
  const stopped = await Promise.race([
    waitForExit(server).then(() => true),
    delay(3000).then(() => false),
  ]);

  if (!stopped && server.exitCode === null && !server.killed) {
    server.kill("SIGKILL");
  }
};

let server = null;

try {
  server = spawnNode(["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
    env: {
      ...process.env,
      PLAYWRIGHT_MANAGED_SERVER: "1",
    },
  });
  await waitForServer();
  await warmupRoutes();

  const playwright = spawnNode([require.resolve("@playwright/test/cli"), "test", ...playwrightArgs], {
    env: {
      ...process.env,
      PLAYWRIGHT_MANAGED_SERVER: "1",
    },
  });
  const { code, signal } = await waitForExit(playwright);

  await stopServer(server);

  if (signal) {
    console.error(`Playwright exited with signal ${signal}.`);
    process.exit(1);
  }

  process.exit(code ?? 1);
} catch (error) {
  console.error(error);
  if (server) {
    await stopServer(server);
  }
  process.exit(1);
}
