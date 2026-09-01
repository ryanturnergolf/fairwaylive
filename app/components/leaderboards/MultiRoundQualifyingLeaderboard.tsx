"use client";

import { useEffect, useMemo, useState } from "react";
import type { QualifyingPlayerResult } from "../../lib/qualifyingModel";
import { partitionLeaderboardFavorites, readLeaderboardFavorites, writeLeaderboardFavorites } from "../../lib/services/leaderboardFavoritesService";
import FavoriteStar from "./FavoriteStar";
import GolfScorecardGrid from "./GolfScorecardGrid";
import RoundSelector from "./RoundSelector";

const formatToPar = (value: number | null) => value === null ? "—" : value === 0 ? "E" : value > 0 ? `+${value}` : String(value);

export default function MultiRoundQualifyingLeaderboard({ eventId, players, operationalCurrentRoundId }: { eventId: string; players: QualifyingPlayerResult[]; operationalCurrentRoundId?: string | null }) {
  const rounds = useMemo(() => {
    const byId = new Map<string, { id: string; roundNumber: number; label: string }>();
    players.forEach((player) => player.segments.forEach((segment) => byId.set(segment.tournamentRoundId, { id: segment.tournamentRoundId, roundNumber: segment.roundNumber, label: `R${segment.roundNumber}` })));
    return [...byId.values()].sort((a, b) => a.roundNumber - b.roundNumber);
  }, [players]);
  const defaultRoundId = rounds.some((round) => round.id === operationalCurrentRoundId) ? String(operationalCurrentRoundId) : rounds[0]?.id ?? "";
  const [globalRoundId, setGlobalRoundId] = useState(defaultRoundId);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedRounds, setExpandedRounds] = useState<Record<string, string>>({});
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  useEffect(() => setFavorites(readLeaderboardFavorites("qualifying-player", eventId)), [eventId]);
  useEffect(() => { if (!rounds.some((round) => round.id === globalRoundId)) setGlobalRoundId(defaultRoundId); }, [defaultRoundId, globalRoundId, rounds]);
  const toggleFavorite = (id: string) => setFavorites((current) => {
    const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id);
    writeLeaderboardFavorites("qualifying-player", eventId, next); return next;
  });
  const partitioned = useMemo(() => partitionLeaderboardFavorites(players.map((player) => ({ ...player, id: player.playerId })), favorites), [favorites, players]);
  const renderPlayer = (player: QualifyingPlayerResult & { id: string }) => {
    const isExpanded = expanded.has(player.playerId);
    const roundId = expandedRounds[player.playerId] ?? globalRoundId;
    const selected = player.segments.find((segment) => segment.tournamentRoundId === globalRoundId);
    const expandedSegment = player.segments.find((segment) => segment.tournamentRoundId === roundId);
    return <div key={player.playerId} className="overflow-hidden rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5]">
      <div className="grid grid-cols-[48px_36px_minmax(0,1fr)] items-center gap-2 px-3 py-2 sm:grid-cols-[48px_42px_minmax(0,1fr)_72px_120px]">
        <FavoriteStar selected={favorites.has(player.playerId)} label={player.playerName} onToggle={() => toggleFavorite(player.playerId)} />
        <span className="font-black">{player.position ?? "—"}</span>
        <button type="button" aria-expanded={isExpanded} onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(player.playerId)) next.delete(player.playerId); else next.add(player.playerId); return next; })} className="min-h-12 truncate text-left font-black text-[#0B3D2E]">{isExpanded ? "▾" : "▸"} {player.playerName}</button>
        <span className="hidden text-center font-black sm:block">{formatToPar(player.toPar)}</span>
        <div className="col-span-3 row-start-2 grid grid-cols-3 gap-1 border-t border-[#E8DCC8] pt-2 text-center text-[10px] sm:col-auto sm:row-auto sm:border-0 sm:pt-0"><span><b className="block">{selected?.score ?? "—"}</b>Score</span><span><b className="block">{formatToPar(selected?.toPar ?? null)}</b>To Par</span><span><b className="block">{selected?.through ?? "Not started"}</b>Thru</span></div>
      </div>
      {isExpanded ? <div className="border-t border-[#E8DCC8] bg-white p-4"><RoundSelector rounds={rounds} selectedRoundId={roundId} onSelect={(id) => setExpandedRounds((current) => ({ ...current, [player.playerId]: id }))} label={`${player.playerName} Qualifying scorecard round`} /><div className="mt-3"><GolfScorecardGrid holes={(expandedSegment?.holeNumbers ?? []).map((holeNumber, index) => ({ holeNumber, par: expandedSegment?.holePars[index] ?? null, score: expandedSegment?.holeScores[index] ?? null }))} label={`${player.playerName} Qualifying scorecard`} /></div></div> : null}
    </div>;
  };
  return <div className="space-y-4"><div className="rounded-xl border border-[#E8DCC8] bg-[#F6F1E6] p-3"><p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#51635C]">Selected round</p><RoundSelector rounds={rounds} selectedRoundId={globalRoundId} onSelect={setGlobalRoundId} label="Qualifying leaderboard round" /></div>{partitioned.favorites.length > 0 ? <section><h4 className="text-xs font-black uppercase tracking-[0.2em] text-[#B8892D]">★ Favorites</h4><div className="mt-2 space-y-2">{partitioned.favorites.map(renderPlayer)}</div></section> : null}<section><h4 className="text-xs font-black uppercase tracking-[0.2em] text-[#51635C]">Standings</h4><div className="mt-2 space-y-2">{partitioned.standings.map(renderPlayer)}</div></section></div>;
}
