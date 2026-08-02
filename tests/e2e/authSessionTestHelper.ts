import type { Page } from "@playwright/test";

const readJwtSubject = (authorization = "") => {
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (!token) return "";
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
    return typeof payload.sub === "string" ? payload.sub : "11111111-1111-4111-8111-111111111111";
  } catch {
    return "11111111-1111-4111-8111-111111111111";
  }
};

export const routeValidCoachSession = (page: Page) =>
  page.context().route("**/auth/v1/user", async (route) => {
    const userId = readJwtSubject(route.request().headers().authorization);
    if (!userId) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "Auth session missing!" }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: userId,
        aud: "authenticated",
        role: "authenticated",
        email: "coach@example.test",
        app_metadata: { provider: "email", providers: ["email"] },
        user_metadata: {},
        identities: [],
        created_at: "2026-07-17T12:00:00.000Z",
        updated_at: "2026-07-17T12:00:00.000Z",
        is_anonymous: false,
      }),
    });
  });
