"use client";

import { useEffect, useMemo, useState } from "react";
import type { MultiRoundPlayerLeaderboardRow, MultiRoundTeamLeaderboardRow, MultiRoundTournamentLeaderboardProjection } from "../../lib/services/multiRoundLeaderboardService";
import { partitionLeaderboardFavorites, readLeaderboardFavorites, writeLeaderboardFavorites, type LeaderboardFavoriteSurface } from "../../lib/services/leaderboardFavoritesService";
import FavoriteStar from "./FavoriteStar";
import GolfScorecardGrid from "./GolfScorecardGrid";
import RoundSelector from "./RoundSelector";

const ScoreSummary = ({ total, toPar, through, className = "" }: { total: number | null; toPar: string; through: string; className?: string }) => (
  <div className={`grid grid-cols-3 gap-2 text-center text-xs ${className}`}>
    <div><span className="block text-[9px] font-black uppercase tracking-wide text-[#6F7C74]">Score</span><strong>{total ?? "—"}</strong></div>
    <div><span className="block text-[9px] font-black uppercase tracking-wide text-[#6F7C74]">To Par</span><strong>{toPar}</strong></div>
    <div><span className="block text-[9px] font-black uppercase tracking-wide text-[#6F7C74]">Thru</span><strong>{through}</strong></div>
  </div>
);

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

const PlayerExpansion = ({ player, roundId, projection, onRoundChange }: { player: MultiRoundPlayerLeaderboardRow; roundId: string; projection: MultiRoundTournamentLeaderboardProjection; onRoundChange: (roundId: string) => void }) => {
  const summary = player.rounds[roundId];
  return (
    <div className="border-t border-[#E8DCC8] bg-white p-4">
      <RoundSelector rounds={projection.rounds} selectedRoundId={roundId} onSelect={onRoundChange} label={`${player.playerName} scorecard round`} />
      <div className="mt-3"><GolfScorecardGrid holes={summary?.holes ?? []} label={`${player.playerName} ${projection.rounds.find((round) => round.id === roundId)?.label ?? "round"} scorecard`} /></div>
    </div>
  );
};

export default function MultiRoundTournamentLeaderboard({ projection, eventId, publicSurface = false, hideTeams = false }: { projection: MultiRoundTournamentLeaderboardProjection; eventId: string; publicSurface?: boolean; hideTeams?: boolean }) {
  const [globalRoundId, setGlobalRoundId] = useState(projection.operationalCurrentRoundId);
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [expandedPlayers, setExpandedPlayers] = useState<Set<string>>(new Set());
  const [teamRounds, setTeamRounds] = useState<Record<string, string>>({});
  const [playerRounds, setPlayerRounds] = useState<Record<string, string>>({});
  const teamFavorites = useFavorites(publicSurface ? "public-team" : "tournament-team", eventId);
  const playerFavorites = useFavorites(publicSurface ? "public-player" : "tournament-player", eventId);
  useEffect(() => {
    if (!projection.rounds.some((round) => round.id === globalRoundId)) setGlobalRoundId(projection.operationalCurrentRoundId);
  }, [globalRoundId, projection.operationalCurrentRoundId, projection.rounds]);
  const selectedRound = projection.rounds.find((round) => round.id === globalRoundId) ?? projection.rounds[0];
  const teams = useMemo(() => partitionLeaderboardFavorites(projection.teams, teamFavorites.favorites), [projection.teams, teamFavorites.favorites]);
  const players = useMemo(() => partitionLeaderboardFavorites(projection.players, playerFavorites.favorites), [projection.players, playerFavorites.favorites]);

  const renderTeam = (team: MultiRoundTeamLeaderboardRow) => {
    const expanded = expandedTeams.has(team.id);
    const roundId = teamRounds[team.id] ?? globalRoundId;
    const selected = team.rounds[globalRoundId];
    return <div key={team.id} className="overflow-hidden rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5]">
      <div className="grid grid-cols-[36px_minmax(0,1fr)_48px] items-center gap-2 px-3 py-2 sm:grid-cols-[42px_minmax(0,1fr)_70px_120px_48px]">
        <span className="font-black">{team.position}</span>
        <button type="button" aria-expanded={expanded} onClick={() => setExpandedTeams((current) => { const next = new Set(current); if (next.has(team.id)) next.delete(team.id); else next.add(team.id); return next; })} className="min-h-12 truncate text-left font-black text-[#0B3D2E]">{expanded ? "▾" : "▸"} {team.teamName}</button>
        <span className="hidden text-center font-black sm:block">{team.overallToPar !== "—" ? team.overallToPar : team.overallTotal ?? "—"}</span>
        <ScoreSummary className="col-span-3 row-start-2 border-t border-[#E8DCC8] pt-2 sm:col-auto sm:row-auto sm:border-0 sm:pt-0" total={selected?.total ?? null} toPar={selected?.toPar ?? "—"} through={selected?.through ?? "Not started"} />
        <FavoriteStar className="col-start-3 row-start-1 sm:col-auto sm:row-auto" selected={teamFavorites.favorites.has(team.id)} label={team.teamName} onToggle={() => teamFavorites.toggle(team.id)} />
      </div>
      {expanded ? <div className="border-t border-[#E8DCC8] bg-white p-4">
        <RoundSelector rounds={projection.rounds} selectedRoundId={roundId} onSelect={(id) => setTeamRounds((current) => ({ ...current, [team.id]: id }))} label={`${team.teamName} expanded round`} />
        <div className="mt-4 space-y-3">{team.players.map((player) => <div key={player.id} className="rounded-xl border border-[#E8DCC8] p-3"><div className="mb-2 flex items-center justify-between gap-3"><strong>{player.playerName}</strong><span className="text-xs font-black">{player.rounds[roundId]?.toPar ?? "—"} · {player.rounds[roundId]?.through ?? "Not started"}</span></div><GolfScorecardGrid holes={player.rounds[roundId]?.holes ?? []} label={`${player.playerName} team scorecard`} /></div>)}</div>
      </div> : null}
    </div>;
  };
  const renderPlayer = (player: MultiRoundPlayerLeaderboardRow) => {
    const expanded = expandedPlayers.has(player.id);
    const roundId = playerRounds[player.id] ?? globalRoundId;
    const selected = player.rounds[globalRoundId];
    return <div key={player.id} className="overflow-hidden rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5]">
      <div className="grid grid-cols-[36px_minmax(0,1fr)_48px] items-center gap-2 px-3 py-2 sm:grid-cols-[42px_minmax(0,1fr)_70px_120px_48px]">
        <span className="font-black">{player.position}</span>
        <button type="button" aria-expanded={expanded} onClick={() => setExpandedPlayers((current) => { const next = new Set(current); if (next.has(player.id)) next.delete(player.id); else next.add(player.id); return next; })} className="min-h-12 min-w-0 text-left"><span className="block truncate font-black text-[#0B3D2E]">{expanded ? "▾" : "▸"} {player.playerName}</span><span className="block truncate text-[10px] text-[#6F7C74]">{player.teamName}</span></button>
        <span className="hidden text-center font-black sm:block">{player.overallToPar !== "—" ? player.overallToPar : player.overallTotal ?? "—"}</span>
        <ScoreSummary className="col-span-3 row-start-2 border-t border-[#E8DCC8] pt-2 sm:col-auto sm:row-auto sm:border-0 sm:pt-0" total={selected?.total ?? null} toPar={selected?.toPar ?? "—"} through={selected?.through ?? "Not started"} />
        <FavoriteStar className="col-start-3 row-start-1 sm:col-auto sm:row-auto" selected={playerFavorites.favorites.has(player.id)} label={player.playerName} onToggle={() => playerFavorites.toggle(player.id)} />
      </div>
      {expanded ? <PlayerExpansion player={player} roundId={roundId} projection={projection} onRoundChange={(id) => setPlayerRounds((current) => ({ ...current, [player.id]: id }))} /> : null}
    </div>;
  };
  const Section = <T extends { id: string }>(title: string, parts: { favorites: T[]; standings: T[] }, render: (row: T) => React.ReactNode) => <section className="rounded-[28px] border border-[#E8DCC8] bg-white/90 p-4 shadow-[0_18px_45px_rgba(11,61,46,0.08)] sm:p-6"><h3 className="text-xl font-black text-[#0B3D2E]">{title}</h3>{parts.favorites.length > 0 ? <><h4 className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-[#B8892D]">★ Favorites</h4><div className="mt-2 space-y-2">{parts.favorites.map(render)}</div></> : null}<h4 className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-[#51635C]">Standings</h4><div className="mt-2 space-y-2">{parts.standings.map(render)}</div></section>;
  return <div className="space-y-5" data-selected-round={selectedRound?.label}><div className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] p-3"><p className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-[#51635C]">Selected round · {selectedRound?.label}</p><RoundSelector rounds={projection.rounds} selectedRoundId={globalRoundId} onSelect={setGlobalRoundId} /></div>{!hideTeams && projection.teams.length > 0 ? Section("Team Leaderboard", teams, renderTeam) : null}{Section("Individual Leaderboard", players, renderPlayer)}</div>;
}
