"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  RosterPlayer,
  RosterPlayerStatus,
  Season,
  SeasonRosterMembership,
} from "../../lib/rosterModel";
import { loadRosterFoundation } from "../../lib/services/rosterFoundationService";
import { CoachBreadcrumbs, CoachHeader, CoachState } from "../components/CoachChrome";

const statusLabels: Record<RosterPlayerStatus, string> = {
  incoming: "Incoming",
  active: "Active",
  redshirt: "Redshirt",
  inactive: "Inactive",
  graduated: "Graduated",
  transferred: "Transferred",
  former: "Former",
};

export default function PlayersDirectory() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [players, setPlayers] = useState<RosterPlayer[]>([]);
  const [memberships, setMemberships] = useState<SeasonRosterMembership[]>([]);
  const [seasonId, setSeasonId] = useState("");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (requestedSeasonId = "") => {
    setIsLoading(true);
    setError("");
    try {
      const foundation = await loadRosterFoundation();
      const selected =
        requestedSeasonId ||
        foundation.seasons.find((season) => season.status === "active")?.id ||
        foundation.seasons[0]?.id ||
        "";
      const selectedFoundation = selected
        ? await loadRosterFoundation(selected)
        : foundation;
      setSeasons(foundation.seasons);
      setPlayers(selectedFoundation.players);
      setMemberships(selectedFoundation.memberships);
      setSeasonId(selected);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load players."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const playerById = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players]
  );
  const visible = memberships.filter((membership) => {
    const player = playerById.get(membership.rosterPlayerId);
    if (!player) return false;
    const name = `${player.preferredName || player.firstName} ${player.lastName}`;
    return name.toLowerCase().includes(search.trim().toLowerCase());
  });

  return (
    <main className="min-h-screen bg-[#F6F1E6] text-[#0B3D2E]">
      <CoachHeader />
      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        <CoachBreadcrumbs items={[{ label: "Coach Dashboard", href: "/coach-dashboard" }, { label: "Players" }]} />
        <p className="text-xs font-black uppercase tracking-[0.28em] text-[#B8892D]">
          Player Analytics
        </p>
        <h1 className="mt-2 text-4xl font-black tracking-tight">Players</h1>
        <p className="mt-2 text-[#51635C]">
          Select a permanent roster identity to open its performance profile.
        </p>

        <section className="mt-6 rounded-lg border border-[#E8DCC8] bg-white p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-bold">
              Season
              <select
                value={seasonId}
                onChange={(event) => void load(event.target.value)}
                className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2"
              >
                <option value="">Select season</option>
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>{season.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-bold">
              Search players
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2"
                placeholder="Search by name"
              />
            </label>
          </div>
          {error ? <div className="mt-4"><CoachState title="Unable to load players" description={error} tone="error" /></div> : null}
          {isLoading ? (
            <div className="mt-6"><CoachState title="Loading roster identities" description="Retrieving seasons and permanent players." /></div>
          ) : visible.length === 0 ? (
            <div className="mt-6"><CoachState title={seasonId ? "No players found" : "No season selected"} description={seasonId ? "No active or archived player matches this season and search." : "Choose or create a season from Roster Management before opening player profiles."} /></div>
          ) : (
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {visible.map((membership) => {
                const player = playerById.get(membership.rosterPlayerId)!;
                const name = `${player.preferredName || player.firstName} ${player.lastName}`;
                return (
                  <article key={membership.id} className="rounded-lg border border-[#E8DCC8] bg-[#FCFAF5] p-4">
                    <h2 className="text-lg font-black">{name}</h2>
                    <p className="mt-1 text-sm text-[#51635C]">
                      {player.rosterType === "men" ? "Men's Team" : "Women's Team"} · {membership.classYear || "Class year not specified"} · {statusLabels[membership.status]}
                    </p>
                    <Link
                      href={`/coach-dashboard/players/${player.id}?seasonId=${seasonId}`}
                      className="mt-4 inline-flex rounded-lg bg-[#0B3D2E] px-4 py-2 text-sm font-black text-white"
                    >
                      View Performance Profile
                    </Link>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
