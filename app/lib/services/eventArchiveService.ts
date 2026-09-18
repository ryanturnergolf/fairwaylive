import { getSupabaseAuthAccessToken } from "../supabaseClient";
import type { EventArchiveInventory, EventArchiveScope } from "../eventArchiveModel";

export type { EventArchiveInventory, EventArchiveScope } from "../eventArchiveModel";

const requestEventArchive = async (options: {
  method: "GET" | "POST";
  scope?: EventArchiveScope;
}): Promise<EventArchiveInventory> => {
  const accessToken = await getSupabaseAuthAccessToken();
  if (!accessToken) throw new Error("Coach authentication is required.");

  const response = await fetch("/api/event-archive", {
    method: options.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
    body: options.method === "POST" ? JSON.stringify({ scope: options.scope }) : undefined,
  });
  const body = (await response.json().catch(() => null)) as EventArchiveInventory | { error?: string } | null;
  if (!response.ok) throw new Error((body as { error?: string } | null)?.error || "Unable to manage archived events.");
  return body as EventArchiveInventory;
};

export const loadEventArchiveInventory = () => requestEventArchive({ method: "GET" });

export const archiveOldEvents = (scope: EventArchiveScope) =>
  requestEventArchive({ method: "POST", scope });
