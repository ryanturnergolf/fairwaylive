"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  rosterPlayerStatuses,
  type RosterPlayer,
  type RosterPlayerStatus,
  type RosterType,
  type Season,
  type SeasonRosterMembership,
} from "../../lib/rosterModel";
import {
  createRosterPlayerForSeason,
  createRosterSeason,
  loadRosterFoundation,
  saveRosterPlayerForSeason,
  transitionRosterPlayerForSeason,
} from "../../lib/services/rosterFoundationService";

const statusLabels: Record<RosterPlayerStatus, string> = {
  active: "Active",
  incoming: "Incoming",
  redshirt: "Redshirt",
  inactive: "Inactive",
  graduated: "Graduated",
  transferred: "Transferred",
  former: "Former",
};

const classYears = ["Freshman", "Sophomore", "Junior", "Senior", "Graduate"];

type PlayerForm = {
  firstName: string;
  lastName: string;
  preferredName: string;
  status: RosterPlayerStatus;
  classYear: string;
};

const emptyPlayerForm = (): PlayerForm => ({
  firstName: "",
  lastName: "",
  preferredName: "",
  status: "active",
  classYear: "",
});

export default function RosterManager({ rosterType }: { rosterType: RosterType }) {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [players, setPlayers] = useState<RosterPlayer[]>([]);
  const [memberships, setMemberships] = useState<SeasonRosterMembership[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RosterPlayerStatus>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editingPlayerId, setEditingPlayerId] = useState("");
  const [playerForm, setPlayerForm] = useState<PlayerForm>(emptyPlayerForm);
  const [showPlayerForm, setShowPlayerForm] = useState(false);
  const [showSeasonForm, setShowSeasonForm] = useState(false);
  const [seasonForm, setSeasonForm] = useState({
    name: "",
    startsOn: "",
    endsOn: "",
  });

  const load = useCallback(async (preferredSeasonId = "") => {
    setIsLoading(true);
    setError("");
    try {
      const foundation = await loadRosterFoundation();
      const seasonId =
        preferredSeasonId ||
        foundation.seasons.find((season) => season.status === "active")?.id ||
        foundation.seasons[0]?.id ||
        "";
      const selectedFoundation = seasonId
        ? await loadRosterFoundation(seasonId)
        : foundation;
      setSeasons(selectedFoundation.seasons);
      setPlayers(selectedFoundation.players);
      setMemberships(selectedFoundation.memberships);
      setSelectedSeasonId(seasonId);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load the roster.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const membershipByPlayerId = useMemo(
    () => new Map(memberships.map((membership) => [membership.rosterPlayerId, membership])),
    [memberships]
  );

  const visiblePlayers = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return players.filter((player) => {
      const membership = membershipByPlayerId.get(player.id);
      if (player.rosterType !== rosterType || !membership) return false;
      if (!showArchived && player.archivedAt) return false;
      if (statusFilter !== "all" && membership.status !== statusFilter) return false;
      const name = `${player.firstName} ${player.lastName} ${player.preferredName ?? ""}`.toLocaleLowerCase();
      return !normalizedSearch || name.includes(normalizedSearch);
    });
  }, [membershipByPlayerId, players, rosterType, search, showArchived, statusFilter]);

  const beginCreatePlayer = () => {
    setEditingPlayerId("");
    setPlayerForm(emptyPlayerForm());
    setShowPlayerForm(true);
    setError("");
    setMessage("");
  };

  const beginEditPlayer = (player: RosterPlayer) => {
    const membership = membershipByPlayerId.get(player.id);
    if (!membership) return;
    setEditingPlayerId(player.id);
    setPlayerForm({
      firstName: player.firstName,
      lastName: player.lastName,
      preferredName: player.preferredName ?? "",
      status: membership.status,
      classYear: membership.classYear ?? "",
    });
    setShowPlayerForm(true);
    setError("");
    setMessage("");
  };

  const handlePlayerSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedSeasonId) {
      setError("Create or select a season before adding players.");
      return;
    }
    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      if (editingPlayerId) {
        await saveRosterPlayerForSeason({
          player: {
            id: editingPlayerId,
            firstName: playerForm.firstName,
            lastName: playerForm.lastName,
            preferredName: playerForm.preferredName,
            status: playerForm.status,
          },
          seasonId: selectedSeasonId,
          classYear: playerForm.classYear,
        });
        setMessage("Player updated.");
      } else {
        await createRosterPlayerForSeason({
          player: {
            firstName: playerForm.firstName,
            lastName: playerForm.lastName,
            preferredName: playerForm.preferredName,
            rosterType,
            status: playerForm.status,
          },
          seasonId: selectedSeasonId,
          classYear: playerForm.classYear,
        });
        setMessage("Player added to the roster.");
      }
      setShowPlayerForm(false);
      setEditingPlayerId("");
      setPlayerForm(emptyPlayerForm());
      await load(selectedSeasonId);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save the player.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLifecycle = async (player: RosterPlayer, status: RosterPlayerStatus) => {
    const membership = membershipByPlayerId.get(player.id);
    if (!membership) return;
    if (status === "former" && !window.confirm(`Archive ${player.firstName} ${player.lastName}? Historical event records will remain intact.`)) {
      return;
    }
    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      await transitionRosterPlayerForSeason({
        player: {
          id: player.id,
          firstName: player.firstName,
          lastName: player.lastName,
          preferredName: player.preferredName,
          status: player.status,
        },
        membership,
        status,
      });
      setMessage(status === "former" ? "Player archived." : "Player restored.");
      await load(selectedSeasonId);
    } catch (lifecycleError) {
      setError(lifecycleError instanceof Error ? lifecycleError.message : "Unable to update the player.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSeasonSave = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      const season = await createRosterSeason({
        name: seasonForm.name,
        startsOn: seasonForm.startsOn,
        endsOn: seasonForm.endsOn,
        status: seasons.length === 0 ? "active" : "planned",
      });
      setShowSeasonForm(false);
      setSeasonForm({ name: "", startsOn: "", endsOn: "" });
      setMessage("Season created.");
      await load(season.id);
    } catch (seasonError) {
      setError(seasonError instanceof Error ? seasonError.message : "Unable to create the season.");
    } finally {
      setIsSaving(false);
    }
  };

  const title = rosterType === "men" ? "Men's Roster" : "Women's Roster";

  return (
    <main className="min-h-screen bg-[#F6F1E6] text-[#0B3D2E]">
      <header className="border-b border-[#E8DCC8] bg-[#FCFAF5]/95">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 lg:px-8">
          <Link href="/coach-dashboard" className="font-black">Clubhouse HQ</Link>
          <nav className="flex items-center gap-4 text-sm font-bold">
            <Link href="/coach-dashboard/roster/men" aria-current={rosterType === "men" ? "page" : undefined}>Men</Link>
            <Link href="/coach-dashboard/roster/women" aria-current={rosterType === "women" ? "page" : undefined}>Women</Link>
            <Link href="/coach-dashboard">Coach Dashboard</Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#B8892D]">Roster Management</p>
            <h1 className="mt-2 text-4xl font-black tracking-tight">{title}</h1>
            <p className="mt-2 max-w-2xl text-[#51635C]">
              Manage permanent player identities by season. Archiving never deletes Tournament or Qualifying history.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setShowSeasonForm((value) => !value)} className="rounded-lg border border-[#0B3D2E] px-4 py-3 text-sm font-black">
              Create Season
            </button>
            <button type="button" onClick={beginCreatePlayer} disabled={!selectedSeasonId} className="rounded-lg bg-[#0B3D2E] px-4 py-3 text-sm font-black text-white disabled:opacity-50">
              Add Player
            </button>
          </div>
        </div>

        {error ? <p role="alert" className="mt-5 rounded-lg border border-[#8A2E2E]/30 bg-[#FFF4F1] p-3 font-semibold text-[#8A2E2E]">{error}</p> : null}
        {message ? <p role="status" className="mt-5 rounded-lg border border-[#2E6F76]/30 bg-[#E6F3F1] p-3 font-semibold">{message}</p> : null}

        {showSeasonForm ? (
          <form onSubmit={handleSeasonSave} className="mt-6 grid gap-4 rounded-lg border border-[#E8DCC8] bg-white p-5 md:grid-cols-4">
            <label className="text-sm font-bold">Season name<input required value={seasonForm.name} onChange={(event) => setSeasonForm({ ...seasonForm, name: event.target.value })} className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2" placeholder="2026-2027" /></label>
            <label className="text-sm font-bold">Start date<input required type="date" value={seasonForm.startsOn} onChange={(event) => setSeasonForm({ ...seasonForm, startsOn: event.target.value })} className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2" /></label>
            <label className="text-sm font-bold">End date<input required type="date" value={seasonForm.endsOn} onChange={(event) => setSeasonForm({ ...seasonForm, endsOn: event.target.value })} className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2" /></label>
            <button disabled={isSaving} className="self-end rounded-lg bg-[#0B3D2E] px-4 py-2 font-black text-white disabled:opacity-60">{isSaving ? "Saving..." : "Save Season"}</button>
          </form>
        ) : null}

        {showPlayerForm ? (
          <form onSubmit={handlePlayerSave} className="mt-6 rounded-lg border border-[#B8892D]/40 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-black">{editingPlayerId ? "Edit Player" : "Add Player"}</h2>
              <button type="button" onClick={() => setShowPlayerForm(false)} className="text-sm font-bold">Cancel</button>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className="text-sm font-bold">First name<input required value={playerForm.firstName} onChange={(event) => setPlayerForm({ ...playerForm, firstName: event.target.value })} className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2" /></label>
              <label className="text-sm font-bold">Last name<input required value={playerForm.lastName} onChange={(event) => setPlayerForm({ ...playerForm, lastName: event.target.value })} className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2" /></label>
              <label className="text-sm font-bold">Preferred name<input value={playerForm.preferredName} onChange={(event) => setPlayerForm({ ...playerForm, preferredName: event.target.value })} className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2" /></label>
              <label className="text-sm font-bold">Player status<select value={playerForm.status} onChange={(event) => setPlayerForm({ ...playerForm, status: event.target.value as RosterPlayerStatus })} className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2">{rosterPlayerStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>
              <label className="text-sm font-bold">Class year<select value={playerForm.classYear} onChange={(event) => setPlayerForm({ ...playerForm, classYear: event.target.value })} className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2"><option value="">Not specified</option>{classYears.map((year) => <option key={year}>{year}</option>)}</select></label>
            </div>
            <button disabled={isSaving} className="mt-5 rounded-lg bg-[#0B3D2E] px-5 py-3 font-black text-white disabled:opacity-60">{isSaving ? "Saving..." : editingPlayerId ? "Save Changes" : "Add Player"}</button>
          </form>
        ) : null}

        <section className="mt-6 rounded-lg border border-[#E8DCC8] bg-white p-5">
          <div className="grid gap-4 md:grid-cols-4">
            <label className="text-sm font-bold">Season<select value={selectedSeasonId} onChange={(event) => void load(event.target.value)} className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2"><option value="">Select season</option>{seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}</select></label>
            <label className="text-sm font-bold md:col-span-2">Search players<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name" className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2" /></label>
            <label className="text-sm font-bold">Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | RosterPlayerStatus)} className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2"><option value="all">All statuses</option>{rosterPlayerStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />Show archived players</label>

          {isLoading ? (
            <p className="mt-6 text-sm font-semibold text-[#51635C]">Loading roster...</p>
          ) : !selectedSeasonId ? (
            <p className="mt-6 rounded-lg border border-dashed border-[#D9D0C0] bg-[#FCFAF5] p-8 text-center font-semibold text-[#51635C]">Create a season to begin managing this roster.</p>
          ) : visiblePlayers.length === 0 ? (
            <p className="mt-6 rounded-lg border border-dashed border-[#D9D0C0] bg-[#FCFAF5] p-8 text-center font-semibold text-[#51635C]">No players match this season and filter.</p>
          ) : (
            <div className="mt-6 grid gap-3">
              {visiblePlayers.map((player) => {
                const membership = membershipByPlayerId.get(player.id)!;
                return (
                  <article key={player.id} className="flex flex-col justify-between gap-4 rounded-lg border border-[#E8DCC8] bg-[#FCFAF5] p-4 sm:flex-row sm:items-center">
                    <div>
                      <h2 className="text-lg font-black">{player.preferredName || player.firstName} {player.lastName}</h2>
                      <p className="mt-1 text-sm text-[#51635C]">{membership.classYear || "Class year not specified"} · {statusLabels[membership.status]}</p>
                      {player.archivedAt ? <p className="mt-1 text-xs font-black uppercase tracking-wide text-[#8A2E2E]">Archived</p> : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => beginEditPlayer(player)} className="rounded-lg border border-[#0B3D2E] px-3 py-2 text-sm font-black">Edit</button>
                      {player.archivedAt ? (
                        <button type="button" disabled={isSaving} onClick={() => void handleLifecycle(player, "active")} className="rounded-lg bg-[#0B3D2E] px-3 py-2 text-sm font-black text-white disabled:opacity-60">Restore</button>
                      ) : (
                        <button type="button" disabled={isSaving} onClick={() => void handleLifecycle(player, "former")} className="rounded-lg border border-[#8A2E2E] px-3 py-2 text-sm font-black text-[#8A2E2E] disabled:opacity-60">Archive</button>
                      )}
                    </div>
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
