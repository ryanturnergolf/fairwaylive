import { expect, test } from "@playwright/test";
import { POST as postClientError } from "../../app/api/monitoring/errors/route";
import { sanitizeOperationalError } from "../../app/lib/monitoringModel";
import { reportOperationalError } from "../../app/lib/services/monitoringService";
import {
  assertProductionEnvironment,
  getProductionEnvironmentReadiness,
} from "../../app/lib/services/productionEnvironmentService";

test("health endpoint reports availability, release, and configuration without secrets", async ({ request }) => {
  const response = await request.get("/api/health");
  const body = await response.json();
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(body).toMatchObject({ application: "available", status: "ok", configuration: "ready" });
  expect(typeof body.release).toBe("string");
  expect(typeof body.checkedAt).toBe("string");
  expect(body).not.toHaveProperty("NEXT_PUBLIC_SUPABASE_URL");
  expect(body).not.toHaveProperty("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  expect(body).not.toHaveProperty("missing");
});

test("missing required production configuration fails clearly but remains non-blocking outside production", () => {
  const incomplete = { NEXT_PUBLIC_APP_URL: "", NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "" };
  expect(getProductionEnvironmentReadiness(incomplete)).toEqual({
    ready: false,
    missing: ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
  });
  expect(() => assertProductionEnvironment(incomplete, "production")).toThrow(
    "Clubhouse HQ production configuration is incomplete"
  );
  expect(assertProductionEnvironment(incomplete, "development").ready).toBe(false);
  expect(assertProductionEnvironment(incomplete, "test").ready).toBe(false);
});

test("monitoring redacts tokens, codes, identifiers, email addresses, and query strings", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJwbGF5ZXIifQ.signaturevalue";
  const longSecret = "a".repeat(70);
  const report = sanitizeOperationalError(
    {
      source: "api",
      name: "RequestError",
      message: `Bearer private-token Scoring code: CFUZND ${jwt} player@example.com ${longSecret} https://example.com/path?code=CFUZND&token=secret`,
      route: "/api/score-mutations?shareToken=private&player=11111111-1111-4111-8111-111111111111",
      method: "post",
      digest: "11111111-1111-4111-8111-111111111111",
    },
    "release-1",
    "2026-08-01T00:00:00.000Z"
  );
  const serialized = JSON.stringify(report);
  expect(serialized).not.toContain("private-token");
  expect(serialized).not.toContain(jwt);
  expect(serialized).not.toContain("player@example.com");
  expect(serialized).not.toContain(longSecret);
  expect(serialized).not.toContain("CFUZND");
  expect(serialized).not.toContain("11111111-1111-4111-8111-111111111111");
  expect(report.route).toBe("/api/score-mutations");
  expect(report.method).toBe("POST");
});

test("monitoring is disabled without explicit configuration and emits only sanitized reports when enabled", () => {
  const reports: unknown[] = [];
  const input = { source: "server" as const, message: "Bearer private-token", route: "/private?token=value" };
  expect(reportOperationalError(input, { environment: {}, write: (report) => reports.push(report) })).toBe(false);
  expect(reports).toHaveLength(0);
  expect(
    reportOperationalError(input, {
      environment: { MONITORING_ENABLED: "true", APP_RELEASE: "commit-123" },
      write: (report) => reports.push(report),
    })
  ).toBe(true);
  expect(reports).toHaveLength(1);
  expect(JSON.stringify(reports[0])).not.toContain("private-token");
  expect(reports[0]).toMatchObject({ release: "commit-123", route: "/private" });
});

test("public client reporting endpoint is inert while monitoring is disabled", async () => {
  const response = await postClientError(
    new Request("http://localhost/api/monitoring/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "client", message: "test failure" }),
    })
  );
  expect(response.status).toBe(204);
  expect(await response.text()).toBe("");
});
