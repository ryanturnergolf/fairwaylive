"use client";

import { useEffect, useMemo, useState } from "react";
import type { MultiRoundPlayerLeaderboardRow, MultiRoundTeamLeaderboardRow, MultiRoundTournamentLeaderboardProjection, RoundLeaderboardSummary } from "../../lib/services/multiRoundLeaderboardService";
import { partitionLeaderboardFavorites, readLeaderboardFavorites, writeLeaderboardFavorites, type LeaderboardFavoriteSurface } from "../../lib/services/leaderboardFavoritesService";
import FavoriteStar from "./FavoriteStar";
import GolfScorecardGrid from "./GolfScorecardGrid";
import RoundSelector from "./RoundSelector";

const displayThrough = (through?: string) => !through || through === "Not started" ? "—" : through.includes("/") ? through.split("/")[0] : through;
const latestStarted = (rounds: MultiRoundTournamentLeaderboardProjection["rounds"], summaries: Record<string, RoundLeaderboardSummary>) =>
  [...rounds].reverse().map((round) => summaries[round.id]).find((summary) => summary?.total !== null) ?? null;

function useFavorites(surface: LeaderboardFavoriteSurface, eventId: string) {
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  useEffect(() => setFavorites(readLeaderboardFavorites(surface, eventId)), [eventId, surface]);
  const toggle = (id: string) => setFavorites((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    writeLeaderboardFavorites(surface, eventId, next);
    return next;
  });
  return { favorites, toggle };
}

const ExpandedScorecard = ({ player, roundId, rounds, onRoundChange, label }: { player: MultiRoundPlayerLeaderboardRow; roundId: string; rounds: MultiRoundTournamentLeaderboardProjection["rounds"]; onRoundChange: (roundId: string) => void; label: string }) => {
  const summary = player.rounds[roundId];
  return <div className="space-y-3">
    <RoundSelector rounds={rounds} selectedRoundId={roundId} onSelect={onRoundChange} label={label} />
    <div className="rounded-xl border border-[#E8DCC8] bg-[#FCFAF5] p-3 text-xs text-[#51635C]">
      <p><strong className="text-[#0B3D2E]">Course:</strong> {summary?.courseName ?? "Course not set"}</p>
      <p className="mt-1"><strong className="text-[#0B3D2E]">Round:</strong> {summary?.total ?? "—"} ({summary?.toPar ?? "—"}) · THRU {displayThrough(summary?.through)}</p>
    </div>
    <GolfScorecardGrid holes={summary?.holes ?? []} label={`${player.playerName} scorecard`} />
  </div>;
};

export default function MultiRoundTournamentLeaderboard({ projection, eventId, publicSurface = false, hideTeams = false }: { projection: MultiRoundTournamentLeaderboardProjection; eventId: string; publicSurface?: boolean; hideTeams?: boolean }) {
  const hasTeams = !hideTeams && projection.teams.length > 0;
  const [view, setView] = useState<"individual" | "team">("individual");
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [expandedPlayers, setExpandedPlayers] = useState<Set<string>>(new Set());
  const [teamRounds, setTeamRounds] = useState<Record<string, string>>({});
  const [playerRounds, setPlayerRounds] = useState<Record<string, string>>({});
  const teamFavorites = useFavorites(publicSurface ? "public-team" : "tournament-team", eventId);
  const playerFavorites = useFavorites(publicSurface ? "public-player" : "tournament-player", eventId);
  const teams = useMemo(() => partitionLeaderboardFavorites(projection.teams, teamFavorites.favorites), [projection.teams, teamFavorites.favorites]);
  const players = useMemo(() => partitionLeaderboardFavorites(projection.players, playerFavorites.favorites), [projection.players, playerFavorites.favorites]);
  const orderedTeams = [...teams.favorites, ...teams.standings];
  const orderedPlayers = [...players.favorites, ...players.standings];
  useEffect(() => { if (!hasTeams && view === "team") setView("individual"); }, [hasTeams, view]);

  const playerRows = orderedPlayers.map((player) => {
    const expanded = expandedPlayers.has(player.id);
    const current = latestStarted(projection.rounds, player.rounds);
    const roundId = playerRounds[player.id] ?? projection.operationalCurrentRoundId ?? current?.roundId;
    return <tbody key={player.id} className="border-t border-[#E8DCC8] first:border-t-0">
      <tr className={playerFavorites.favorites.has(player.id) ? "bg-[#FFF9E8]" : "bg-white"}>
        <td className="sticky left-0 z-10 min-w-14 bg-inherit px-2 py-2"><FavoriteStar selected={playerFavorites.favorites.has(player.id)} label={player.playerName} onToggle={() => playerFavorites.toggle(player.id)} /></td>
        <td className="px-3 py-3 text-center font-black">{player.position}</td>
        <td className="sticky left-14 z-10 min-w-48 bg-inherit px-3 py-2"><button type="button" aria-expanded={expanded} onClick={() => setExpandedPlayers((currentSet) => { const next = new Set(currentSet); if (next.has(player.id)) next.delete(player.id); else next.add(player.id); return next; })} className="min-h-11 w-full text-left font-black text-[#0B3D2E]">{expanded ? "▾" : "▸"} {player.playerName}</button><span className="block pl-5 text-[10px] font-semibold text-[#6F7C74]">{player.teamName}</span></td>
        <td className="px-3 py-3 text-center font-black">{player.overallToPar}</td><td className="px-3 py-3 text-center font-black">{displayThrough(current?.through)}</td><td className="px-3 py-3 text-center font-black">{current?.toPar ?? "—"}</td>
        {projection.rounds.map((round) => <td key={round.id} className="px-3 py-3 text-center font-black">{player.rounds[round.id]?.total ?? "—"}</td>)}<td className="px-3 py-3 text-center font-black">{player.overallTotal ?? "—"}</td>
      </tr>
      {expanded ? <tr><td colSpan={7 + projection.rounds.length} className="bg-white p-4"><ExpandedScorecard player={player} roundId={roundId} rounds={projection.rounds} onRoundChange={(id) => setPlayerRounds((currentRounds) => ({ ...currentRounds, [player.id]: id }))} label={`${player.playerName} scorecard round`} /></td></tr> : null}
    </tbody>;
  });

  const teamRows = orderedTeams.map((team: MultiRoundTeamLeaderboardRow) => {
    const expanded = expandedTeams.has(team.id);
    const current = latestStarted(projection.rounds, team.rounds);
    const roundId = teamRounds[team.id] ?? projection.operationalCurrentRoundId ?? current?.roundId;
    return <tbody key={team.id} className="border-t border-[#E8DCC8] first:border-t-0">
      <tr className={teamFavorites.favorites.has(team.id) ? "bg-[#FFF9E8]" : "bg-white"}>
        <td className="sticky left-0 z-10 min-w-14 bg-inherit px-2 py-2"><FavoriteStar selected={teamFavorites.favorites.has(team.id)} label={team.teamName} onToggle={() => teamFavorites.toggle(team.id)} /></td><td className="px-3 py-3 text-center font-black">{team.position}</td>
        <td className="sticky left-14 z-10 min-w-48 bg-inherit px-3 py-2"><button type="button" aria-expanded={expanded} onClick={() => setExpandedTeams((currentSet) => { const next = new Set(currentSet); if (next.has(team.id)) next.delete(team.id); else next.add(team.id); return next; })} className="min-h-11 w-full text-left font-black text-[#0B3D2E]">{expanded ? "▾" : "▸"} {team.teamName}</button></td>
        <td className="px-3 py-3 text-center font-black">{team.overallToPar}</td><td className="px-3 py-3 text-center font-black">{displayThrough(current?.through)}</td>{projection.rounds.map((round) => <td key={round.id} className="px-3 py-3 text-center font-black">{team.rounds[round.id]?.total ?? "—"}</td>)}<td className="px-3 py-3 text-center font-black">{team.overallTotal ?? "—"}</td>
      </tr>
      {expanded ? <tr><td colSpan={6 + projection.rounds.length} className="bg-white p-4"><RoundSelector rounds={projection.rounds} selectedRoundId={roundId} onSelect={(id) => setTeamRounds((currentRounds) => ({ ...currentRounds, [team.id]: id }))} label={`${team.teamName} expanded round`} /><p className="mt-3 text-sm font-black text-[#0B3D2E]">{team.rounds[roundId]?.courseName ?? "Course not set"}</p><div className="mt-3 space-y-4">{team.players.map((player) => <div key={player.id} className="rounded-xl border border-[#E8DCC8] p-3"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><strong>{player.playerName}</strong><span className="text-xs font-black">{player.rounds[roundId]?.total ?? "—"} · {player.rounds[roundId]?.toPar ?? "—"} · THRU {displayThrough(player.rounds[roundId]?.through)}</span></div><GolfScorecardGrid holes={player.rounds[roundId]?.holes ?? []} label={`${player.playerName} team scorecard`} /></div>)}</div></td></tr> : null}
    </tbody>;
  });

  const showingTeams = view === "team" && hasTeams;
  return <div className="space-y-4" data-selected-round={projection.rounds.find((round) => round.id === projection.operationalCurrentRoundId)?.label}>
    {hasTeams ? <div role="tablist" aria-label="Leaderboard view" className="inline-flex rounded-full border border-[#D9C9AD] bg-[#F6F1E6] p-1">{(["individual", "team"] as const).map((option) => <button key={option} type="button" role="tab" aria-selected={view === option} onClick={() => setView(option)} className={`min-h-11 rounded-full px-5 text-sm font-black ${view === option ? "bg-[#0B3D2E] text-white" : "text-[#0B3D2E]"}`}>{option === "individual" ? "Individual" : "Team"}</button>)}</div> : null}
    <section className="rounded-[24px] border border-[#E8DCC8] bg-white shadow-[0_18px_45px_rgba(11,61,46,0.08)]"><h3 className="px-4 pt-4 text-xl font-black text-[#0B3D2E] sm:px-6">{showingTeams ? "Team Leaderboard" : "Individual Leaderboard"}</h3><div className="mt-3 max-w-full overflow-x-auto" tabIndex={0} aria-label={`${showingTeams ? "team" : "individual"} standings table`}><table className="min-w-max border-collapse text-sm"><thead className="bg-[#F6F1E6] text-[10px] font-black uppercase tracking-wider text-[#51635C]"><tr><th className="sticky left-0 z-20 bg-[#F6F1E6] px-2 py-3" aria-label="Favorite">★</th><th className="px-3 py-3">Pos</th><th className="sticky left-14 z-20 bg-[#F6F1E6] px-3 py-3 text-left">{showingTeams ? "Team" : "Player"}</th><th className="px-3 py-3">Total</th><th className="px-3 py-3">Thru</th>{!showingTeams ? <th className="px-3 py-3">Today</th> : null}{projection.rounds.map((round) => <th key={round.id} className="px-3 py-3">{round.label}</th>)}<th className="px-3 py-3">Total Strokes</th></tr></thead>{showingTeams ? teamRows : playerRows}</table></div></section>
  </div>;
}
