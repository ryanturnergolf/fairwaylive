import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("local development enables Windows system CA trust only for the dev command", () => {
  const packageJson = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  const runner = read("scripts/run-dev.mjs");

  expect(packageJson.scripts.dev).toBe("node scripts/run-dev.mjs");
  expect(packageJson.scripts.build).toBe("next build");
  expect(packageJson.scripts.start).toBe("next start");
  expect(packageJson.scripts["test:e2e"]).toBe("node scripts/run-e2e.mjs");
  expect(runner).toContain('const systemCaOption = "--use-system-ca"');
  expect(runner).toContain("NODE_OPTIONS: nodeOptions.join");
});

test("shared portal logos use their designated landing pages", () => {
  expect(read("app/coach-dashboard/components/CoachChrome.tsx")).toContain('<Link href="/coach-dashboard"');
  expect(read("app/coach-dashboard/page.tsx")).toContain('<Link href="/coach-dashboard" className="flex items-center gap-3">');
  expect(read("app/dashboard/page.tsx")).toContain('<Link href="/dashboard" className="flex items-center gap-3">');
  expect(read("app/tournament/[id]/page.tsx")).toContain('<Link href="/dashboard"');
});

test("public and mobile scoring logos return to the public homepage", () => {
  expect(read("app/page.tsx")).toContain('<Link href="/" className="flex items-center gap-3">');
  expect(read("app/live/page.tsx")).toContain('<Link href="/" className="flex items-center gap-3">');
  expect(read("app/player-tournament-login/page.tsx")).toContain('href="/"');
  expect(read("app/qualifying-login/page.tsx")).toContain('<Link href="/"');
  expect(read("app/leaderboard/page.tsx")).toContain('<Link href="/"');
  expect(read("app/scorecard/[playerId]/page.tsx").match(/<Link href="\/" className="flex items-center gap-3">/g)).toHaveLength(3);
});
