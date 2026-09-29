"use client";

import { useEffect, useMemo, useState } from "react";
import type { QualifyingPlayerResult, QualifyingSegmentResult } from "../../lib/qualifyingModel";
import { partitionLeaderboardFavorites, readLeaderboardFavorites, writeLeaderboardFavorites } from "../../lib/services/leaderboardFavoritesService";
import FavoriteStar from "./FavoriteStar";
import GolfScorecardGrid from "./GolfScorecardGrid";
import RoundSelector from "./RoundSelector";

const formatToPar = (value: number | null) => value === null ? "—" : value === 0 ? "E" : value > 0 ? `+${value}` : String(value);
const displayThrough = (through?: string) => !through || through === "Not started" ? "—" : through.includes("/") ? through.split("/")[0] : through;
const latestStarted = (segments: QualifyingSegmentResult[]) => [...segments].reverse().find((segment) => segment.score !== null) ?? null;

export default function MultiRoundQualifyingLeaderboard({ eventId, players, operationalCurrentRoundId }: { eventId: string; players: QualifyingPlayerResult[]; operationalCurrentRoundId?: string | null }) {
  const rounds = useMemo(() => {
    const byId = new Map<string, { id: string; roundNumber: number; label: string }>();
    players.forEach((player) => player.segments.forEach((segment) => byId.set(segment.tournamentRoundId, { id: segment.tournamentRoundId, roundNumber: segment.roundNumber, label: `R${segment.roundNumber}` })));
    return [...byId.values()].sort((a, b) => a.roundNumber - b.roundNumber);
  }, [players]);
  const defaultRoundId = rounds.some((round) => round.id === operationalCurrentRoundId) ? String(operationalCurrentRoundId) : rounds[0]?.id ?? "";
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedRounds, setExpandedRounds] = useState<Record<string, string>>({});
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  useEffect(() => setFavorites(readLeaderboardFavorites("qualifying-player", eventId)), [eventId]);
  const toggleFavorite = (id: string) => setFavorites((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); writeLeaderboardFavorites("qualifying-player", eventId, next); return next; });
  const partitioned = useMemo(() => partitionLeaderboardFavorites(players.map((player) => ({ ...player, id: player.playerId })), favorites), [favorites, players]);
  const ordered = [...partitioned.favorites, ...partitioned.standings];

  return <section className="rounded-[24px] border border-[#E8DCC8] bg-white shadow-[0_18px_45px_rgba(11,61,46,0.08)]">
    <h3 className="px-4 pt-4 text-xl font-black text-[#0B3D2E] sm:px-6">Individual Leaderboard</h3>
    <div className="mt-3 max-w-full overflow-x-auto" tabIndex={0} aria-label="Qualifying individual standings table">
      <table className="min-w-max border-collapse text-sm">
        <thead className="bg-[#F6F1E6] text-[10px] font-black uppercase tracking-wider text-[#51635C]"><tr><th className="sticky left-0 z-20 bg-[#F6F1E6] px-2 py-3" aria-label="Favorite">★</th><th className="px-3 py-3">Pos</th><th className="sticky left-14 z-20 bg-[#F6F1E6] px-3 py-3 text-left">Player</th><th className="px-3 py-3">Total</th><th className="px-3 py-3">Thru</th><th className="px-3 py-3">Today</th>{rounds.map((round) => <th key={round.id} className="px-3 py-3">{round.label}</th>)}<th className="px-3 py-3">Total Strokes</th></tr></thead>
        {ordered.map((player) => {
          const isExpanded = expanded.has(player.playerId);
          const current = latestStarted(player.segments);
          const roundId = expandedRounds[player.playerId] ?? defaultRoundId ?? current?.tournamentRoundId;
          const selected = player.segments.find((segment) => segment.tournamentRoundId === roundId);
          return <tbody key={player.playerId} className="border-t border-[#E8DCC8] first:border-t-0">
            <tr className={favorites.has(player.playerId) ? "bg-[#FFF9E8]" : "bg-white"}><td className="sticky left-0 z-10 min-w-14 bg-inherit px-2 py-2"><FavoriteStar selected={favorites.has(player.playerId)} label={player.playerName} onToggle={() => toggleFavorite(player.playerId)} /></td><td className="px-3 py-3 text-center font-black">{player.position ?? "—"}</td><td className="sticky left-14 z-10 min-w-48 bg-inherit px-3 py-2"><button type="button" aria-expanded={isExpanded} onClick={() => setExpanded((currentSet) => { const next = new Set(currentSet); if (next.has(player.playerId)) next.delete(player.playerId); else next.add(player.playerId); return next; })} className="min-h-11 w-full text-left font-black text-[#0B3D2E]">{isExpanded ? "▾" : "▸"} {player.playerName}</button></td><td className="px-3 py-3 text-center font-black">{formatToPar(player.toPar)}</td><td className="px-3 py-3 text-center font-black">{displayThrough(current?.through)}</td><td className="px-3 py-3 text-center font-black">{formatToPar(current?.toPar ?? null)}</td>{rounds.map((round) => <td key={round.id} className="px-3 py-3 text-center font-black">{player.segments.find((segment) => segment.tournamentRoundId === round.id)?.score ?? "—"}</td>)}<td className="px-3 py-3 text-center font-black">{player.score ?? "—"}</td></tr>
            {isExpanded ? <tr><td colSpan={7 + rounds.length} className="bg-white p-4"><RoundSelector rounds={rounds} selectedRoundId={roundId} onSelect={(id) => setExpandedRounds((currentRounds) => ({ ...currentRounds, [player.playerId]: id }))} label={`${player.playerName} Qualifying scorecard round`} /><div className="mt-3 rounded-xl border border-[#E8DCC8] bg-[#FCFAF5] p-3 text-xs text-[#51635C]"><p><strong className="text-[#0B3D2E]">Course:</strong> {selected?.courseName || "Course not set"}</p><p className="mt-1"><strong className="text-[#0B3D2E]">Round:</strong> {selected?.score ?? "—"} ({formatToPar(selected?.toPar ?? null)}) · THRU {displayThrough(selected?.through)}</p></div><div className="mt-3"><GolfScorecardGrid holes={(selected?.holeNumbers ?? []).map((holeNumber, index) => ({ holeNumber, par: selected?.holePars[index] ?? null, score: selected?.holeScores[index] ?? null }))} label={`${player.playerName} Qualifying scorecard`} /></div></td></tr> : null}
          </tbody>;
        })}
      </table>
    </div>
  </section>;
}
