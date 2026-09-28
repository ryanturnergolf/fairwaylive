"use client";

import { useEffect, useMemo, useState } from "react";
import type { QualifyingRoundPairingGroup, QualifyingSessionFoundation } from "../../lib/qualifyingModel";
import {
  buildQualifyingPairingsByScore,
  normalizeQualifyingManualPairings,
  saveQualifyingRoundPairings,
} from "../../lib/services/qualifyingPairingService";
import { loadQualifyingResults } from "../../lib/services/qualifyingSessionService";

type Props = {
  foundation: QualifyingSessionFoundation;
  onSaved: (roundNumber: number, groups: QualifyingRoundPairingGroup[]) => void;
};

const initialGroupsForRound = (foundation: QualifyingSessionFoundation, roundNumber: number) => {
  const durable = (foundation.roundPairings ?? []).filter((group) => group.roundNumber === roundNumber);
  if (durable.length > 0) return structuredClone(durable);
  const configuredRound = foundation.configuredRounds?.find((round) => round.roundNumber === roundNumber);
  const day = foundation.days.find((candidate) => candidate.dayNumber === configuredRound?.qualifyingDay);
  return foundation.session.groups.map((group, groupIndex) => ({
    roundNumber,
    groupNumber: groupIndex + 1,
    startingHole: day?.startingHole ?? 1,
    players: group.playerIds.map((playerId, position, playerIds) => ({
      playerId,
      playerName: foundation.session.selectedPlayers.find((player) => player.id === playerId)?.name ?? "Player",
      position: position + 1,
      markerPlayerId: playerIds.length > 1 ? playerIds[(position + 1) % playerIds.length] : null,
    })),
  }));
};

export default function QualifyingPairingsPanel({ foundation, onSaved }: Props) {
  const rounds = foundation.configuredRounds ?? [];
  const operationalRound = rounds.find((round) =>
    round.qualifyingRoundId === foundation.session.operationalCurrentQualifyingRoundId
  )?.roundNumber ?? rounds[0]?.roundNumber ?? 1;
  const [roundNumber, setRoundNumber] = useState(operationalRound);
  const [draftGroups, setDraftGroups] = useState<QualifyingRoundPairingGroup[]>(() => initialGroupsForRound(foundation, operationalRound));
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setDraftGroups(initialGroupsForRound(foundation, roundNumber));
    setIsEditing(false);
    setMessage("");
  }, [foundation.session.id, roundNumber]);

  const selectedRound = rounds.find((round) => round.roundNumber === roundNumber);
  const isReadOnly = ["finalized", "complete"].includes(foundation.session.status);
  const expectedPlayerIds = useMemo(
    () => foundation.session.selectedPlayers.map((player) => player.id),
    [foundation.session.selectedPlayers]
  );

  const persist = async (groups: QualifyingRoundPairingGroup[], successMessage: string) => {
    setIsSaving(true);
    setMessage("");
    try {
      const normalized = normalizeQualifyingManualPairings(roundNumber, groups, expectedPlayerIds);
      const saved = await saveQualifyingRoundPairings(foundation.session.id, roundNumber, normalized);
      setDraftGroups(saved);
      setIsEditing(false);
      setMessage(successMessage);
      onSaved(roundNumber, saved);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to save round pairings.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRePair = async () => {
    if (roundNumber < 2) return;
    if (!window.confirm(`Replace the existing R${roundNumber} groups using cumulative standings through R${roundNumber - 1}? Earlier-round groups and scores will not change.`)) return;
    setIsSaving(true);
    setMessage("");
    try {
      const results = await loadQualifyingResults(foundation.session.id, { fresh: true });
      const baseSizes = foundation.session.groups.map((group) => group.playerIds.length);
      const repaired = buildQualifyingPairingsByScore({
        players: foundation.session.selectedPlayers,
        results,
        targetRoundNumber: roundNumber,
        groupSizes: baseSizes,
        startingHoles: draftGroups.map((group) => group.startingHole),
      });
      const saved = await saveQualifyingRoundPairings(foundation.session.id, roundNumber, repaired);
      setDraftGroups(saved);
      setMessage(`R${roundNumber} groups were rebuilt from cumulative standings.`);
      onSaved(roundNumber, saved);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to re-pair this round.");
    } finally {
      setIsSaving(false);
    }
  };

  const movePlayer = (playerId: string, targetGroupNumber: number) => setDraftGroups((current) => {
    const player = current.flatMap((group) => group.players).find((candidate) => candidate.playerId === playerId);
    if (!player) return current;
    return current.map((group) => ({
      ...group,
      players: group.groupNumber === targetGroupNumber
        ? [...group.players.filter((candidate) => candidate.playerId !== playerId), player]
        : group.players.filter((candidate) => candidate.playerId !== playerId),
    }));
  });

  const moveWithinGroup = (groupNumber: number, playerIndex: number, direction: -1 | 1) => setDraftGroups((current) => current.map((group) => {
    if (group.groupNumber !== groupNumber) return group;
    const targetIndex = playerIndex + direction;
    if (targetIndex < 0 || targetIndex >= group.players.length) return group;
    const players = [...group.players];
    [players[playerIndex], players[targetIndex]] = [players[targetIndex], players[playerIndex]];
    return { ...group, players };
  }));

  return (
    <section aria-label="Round pairings" className="grid gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-[#E8DCC8] bg-[#FCFAF5] p-4 sm:flex-row sm:items-end sm:justify-between">
        <label className="grid gap-1 text-xs font-black uppercase tracking-[0.16em] text-[#51635C]">
          Round to edit
          <select value={roundNumber} onChange={(event) => setRoundNumber(Number(event.target.value))} className="min-h-12 rounded-lg border border-[#D9D0C0] bg-white px-3 text-sm font-black normal-case tracking-normal text-[#0B3D2E]">
            {rounds.map((round) => <option key={round.qualifyingRoundId} value={round.roundNumber}>{round.displayLabel} · Day {round.qualifyingDay}</option>)}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={roundNumber < 2 || isSaving || isReadOnly} onClick={() => void handleRePair()} className="min-h-11 rounded-lg bg-[#0B3D2E] px-4 py-2 text-sm font-black text-white disabled:opacity-50">Re-pair by Score</button>
          <button type="button" disabled={isSaving || isReadOnly} onClick={() => setIsEditing((current) => !current)} className="min-h-11 rounded-lg border border-[#0B3D2E] px-4 py-2 text-sm font-black disabled:opacity-50">{isEditing ? "Cancel Manual Edit" : "Edit Manually"}</button>
        </div>
      </div>

      <div className="rounded-xl border border-[#D6E0D8] bg-[#F8FBF8] p-4">
        <p className="font-black">Editing {selectedRound?.displayLabel ?? `R${roundNumber}`}</p>
        <p className="mt-1 text-sm font-semibold text-[#51635C]">Pairing changes apply only to this round. Submitted rounds are protected from replacement.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {draftGroups.map((group) => (
          <article key={group.groupNumber} className="rounded-xl border border-[#E8DCC8] bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-black">Group {group.groupNumber}</h3>
              {isEditing ? <label className="text-xs font-bold text-[#51635C]">Start <input aria-label={`Group ${group.groupNumber} starting hole`} type="number" min={1} max={18} value={group.startingHole} onChange={(event) => setDraftGroups((current) => current.map((candidate) => candidate.groupNumber === group.groupNumber ? { ...candidate, startingHole: Number(event.target.value) } : candidate))} className="ml-1 w-16 rounded border border-[#D9D0C0] px-2 py-1" /></label> : <span className="text-xs font-bold text-[#51635C]">Start {group.startingHole}</span>}
            </div>
            <div className="mt-3 grid gap-2">
              {group.players.map((player, playerIndex) => (
                <div key={player.playerId} className="rounded-lg border border-[#E8DCC8] bg-[#FCFAF5] p-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-[#D9D0C0] text-xs font-black">{playerIndex + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-black">{player.playerName}</span>
                    {isEditing ? <div className="flex gap-1"><button type="button" aria-label={`Move ${player.playerName} up`} onClick={() => moveWithinGroup(group.groupNumber, playerIndex, -1)} className="min-h-9 min-w-9 rounded border border-[#D9D0C0]">↑</button><button type="button" aria-label={`Move ${player.playerName} down`} onClick={() => moveWithinGroup(group.groupNumber, playerIndex, 1)} className="min-h-9 min-w-9 rounded border border-[#D9D0C0]">↓</button></div> : null}
                  </div>
                  {isEditing ? <select aria-label={`Group for ${player.playerName}`} value={group.groupNumber} onChange={(event) => movePlayer(player.playerId, Number(event.target.value))} className="mt-2 min-h-10 w-full rounded border border-[#D9D0C0] bg-white px-2 text-sm font-semibold">{draftGroups.map((option) => <option key={option.groupNumber} value={option.groupNumber}>Group {option.groupNumber}</option>)}</select> : <p className="mt-1 pl-9 text-xs font-semibold text-[#51635C]">Marks {group.players.find((candidate) => candidate.playerId === player.markerPlayerId)?.playerName ?? "Assigned on save"}</p>}
                </div>
              ))}
              {group.players.length === 0 ? <p className="text-sm font-semibold text-[#8A2E2E]">Move players here before saving.</p> : null}
            </div>
            {isEditing && group.players.length === 0 && draftGroups.length > 1 ? <button type="button" onClick={() => setDraftGroups((current) => current.filter((candidate) => candidate.groupNumber !== group.groupNumber).map((candidate, index) => ({ ...candidate, groupNumber: index + 1 })))} className="mt-3 text-xs font-black text-[#8A2E2E]">Remove empty group</button> : null}
          </article>
        ))}
      </div>

      {isEditing ? <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setDraftGroups((current) => [...current, { roundNumber, groupNumber: current.length + 1, startingHole: current[0]?.startingHole ?? 1, players: [] }])} className="min-h-11 rounded-lg border border-[#0B3D2E] px-4 py-2 text-sm font-black">Add Group</button><button type="button" disabled={isSaving} onClick={() => void persist(draftGroups, `R${roundNumber} manual pairings saved.`)} className="min-h-11 rounded-lg bg-[#B8892D] px-4 py-2 text-sm font-black text-[#0B3D2E] disabled:opacity-50">{isSaving ? "Saving…" : "Save Manual Pairings"}</button></div> : null}
      {message ? <p role="status" className="rounded-lg border border-[#D6E0D8] bg-white p-3 text-sm font-semibold text-[#51635C]">{message}</p> : null}
    </section>
  );
}
