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
  expect(getProductionEnvironmentReadiness(incomplete, "production")).toMatchObject({
    ready: false,
    context: "production",
    missing: ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    issues: [],
  });
  expect(() => assertProductionEnvironment(incomplete, "production")).toThrow(
    "Clubhouse HQ production configuration is invalid"
  );
  expect(assertProductionEnvironment(incomplete, "development").ready).toBe(false);
  expect(assertProductionEnvironment(incomplete, "test").ready).toBe(false);
});

test("valid production configuration requires public HTTPS URLs and aligned monitoring release identity", () => {
  const valid = {
    NEXT_PUBLIC_APP_URL: "https://clubhouse-hq.example.org",
    NEXT_PUBLIC_SUPABASE_URL: "https://project-ref.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
    MONITORING_ENABLED: "true",
    NEXT_PUBLIC_MONITORING_ENABLED: "true",
    APP_RELEASE: "commit-123",
  };
  expect(getProductionEnvironmentReadiness(valid, "production")).toEqual({
    ready: true,
    context: "production",
    missing: [],
    issues: [],
  });
  expect(assertProductionEnvironment(valid, "production").ready).toBe(true);
});

test("malformed URLs and credentials fail without disclosing configured values", () => {
  const invalid = {
    NEXT_PUBLIC_APP_URL: "not-a-url-sensitive-value",
    NEXT_PUBLIC_SUPABASE_URL: "https://user:private-value@project-ref.supabase.co?key=private-value",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "private-anon-value",
  };
  const readiness = getProductionEnvironmentReadiness(invalid, "production");
  expect(readiness.ready).toBe(false);
  expect(readiness.issues.map((issue) => issue.variable)).toEqual([
    "NEXT_PUBLIC_APP_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
  ]);
  let message = "";
  try {
    assertProductionEnvironment(invalid, "production");
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  expect(message).toContain("NEXT_PUBLIC_APP_URL");
  expect(message).toContain("NEXT_PUBLIC_SUPABASE_URL");
  expect(message).not.toContain("not-a-url-sensitive-value");
  expect(message).not.toContain("private-value");
  expect(message).not.toContain("private-anon-value");
});

test("configured application and Supabase URLs must be origins without paths", () => {
  const invalid = {
    NEXT_PUBLIC_APP_URL: "https://clubhouse-hq.example.org/application",
    NEXT_PUBLIC_SUPABASE_URL: "https://project-ref.supabase.co/rest/v1",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
  };
  expect(getProductionEnvironmentReadiness(invalid, "production").issues).toEqual([
    { variable: "NEXT_PUBLIC_APP_URL", reason: "must be an origin without a path" },
    { variable: "NEXT_PUBLIC_SUPABASE_URL", reason: "must be an origin without a path" },
  ]);
});

test("actual production rejects loopback and reserved origins while CI and preview preserve test origins", () => {
  const local = {
    NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-anon-key",
  };
  expect(getProductionEnvironmentReadiness(local, "production").ready).toBe(false);
  expect(getProductionEnvironmentReadiness({ ...local, NEXT_PUBLIC_APP_URL: "http://localhost:3100" }, "production").ready).toBe(false);

  const ci = {
    NEXT_PUBLIC_APP_URL: "https://ci.clubhouse-hq.example",
    NEXT_PUBLIC_SUPABASE_URL: "https://project-ref.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
    CI: "true",
  };
  expect(getProductionEnvironmentReadiness(ci, "production")).toMatchObject({ ready: true, context: "ci" });
  expect(
    getProductionEnvironmentReadiness({ ...ci, CI: "false", VERCEL_ENV: "preview" }, "production")
  ).toMatchObject({ ready: true, context: "preview" });
  expect(getProductionEnvironmentReadiness({ ...ci, CI: "false" }, "production").ready).toBe(false);
  expect(
    getProductionEnvironmentReadiness(
      {
        ...local,
        PLAYWRIGHT_MANAGED_SERVER: "1",
      },
      "production"
    )
  ).toMatchObject({ ready: true, context: "test" });
});

test("production monitoring flags must be valid and aligned with release identity", () => {
  const base = {
    NEXT_PUBLIC_APP_URL: "https://clubhouse-hq.example.org",
    NEXT_PUBLIC_SUPABASE_URL: "https://project-ref.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
  };
  expect(
    getProductionEnvironmentReadiness({ ...base, MONITORING_ENABLED: "true", NEXT_PUBLIC_MONITORING_ENABLED: "false" }, "production")
      .issues
  ).toContainEqual(expect.objectContaining({ variable: "MONITORING_ENABLED/NEXT_PUBLIC_MONITORING_ENABLED" }));
  expect(
    getProductionEnvironmentReadiness({ ...base, MONITORING_ENABLED: "enabled", NEXT_PUBLIC_MONITORING_ENABLED: "false" }, "production")
      .issues
  ).toContainEqual(expect.objectContaining({ variable: "MONITORING_ENABLED" }));
  expect(
    getProductionEnvironmentReadiness({ ...base, MONITORING_ENABLED: "true", NEXT_PUBLIC_MONITORING_ENABLED: "true" }, "production")
      .issues
  ).toContainEqual(expect.objectContaining({ variable: "APP_RELEASE" }));
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
