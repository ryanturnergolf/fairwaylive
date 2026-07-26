"use client";

import { useMemo, useState } from "react";
import type { QualifyingSessionFoundation } from "../../lib/qualifyingModel";
import { saveQualifyingScorerAssignments } from "../../lib/services/qualifyingSessionService";

export default function DesignatedScorerAssignments({
  foundation,
  onSaved,
}: {
  foundation: QualifyingSessionFoundation;
  onSaved: (assignments: QualifyingSessionFoundation["scorerAssignments"]) => void;
}) {
  const { session, rounds, scorerAssignments } = foundation;
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      scorerAssignments.map((item) => [`${item.tournamentRoundId}:${item.groupNumber}`, item.scorerPlayerId])
    )
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const rows = useMemo(
    () => rounds.flatMap((round) => session.groups.map((group, index) => ({
      round,
      group,
      groupNumber: index + 1,
      key: `${round.id}:${index + 1}`,
    }))),
    [rounds, session.groups]
  );
  const complete = rows.length > 0 && rows.every((row) => row.group.playerIds.includes(selected[row.key]));

  const save = async () => {
    setBusy(true);
    setMessage("");
    try {
      const payload = rows.map((row) => ({
        tournamentRoundId: row.round.id,
        groupNumber: row.groupNumber,
        scorerPlayerId: selected[row.key],
      }));
      await saveQualifyingScorerAssignments(session.id, payload);
      onSaved(payload.map((item, index) => ({
        id: `${session.id}:${item.tournamentRoundId}:${item.groupNumber}`,
        qualifyingSessionId: session.id,
        ...item,
        createdAt: null,
        updatedAt: null,
      })));
      setMessage("Designated scorer assignments saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save assignments.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-4 rounded-lg border border-[#D8C9AE] bg-white p-4">
      <h3 className="font-black">Designated Group Scorers</h3>
      <div className="mt-3 grid gap-3">
        {rows.map(({ round, group, groupNumber, key }) => (
          <label key={key} className="grid gap-1 text-sm font-bold sm:grid-cols-[1fr_1fr] sm:items-center">
            <span>Round {round.roundNumber} · Group {groupNumber}</span>
            <select
              aria-label={`Round ${round.roundNumber} Group ${groupNumber} scorer`}
              value={selected[key] ?? ""}
              onChange={(event) => setSelected((current) => ({ ...current, [key]: event.target.value }))}
              className="rounded-lg border px-3 py-2"
            >
              <option value="">Select scorer</option>
              {session.selectedPlayers.filter((player) => group.playerIds.includes(player.id)).map((player) => (
                <option key={player.id} value={player.id}>{player.name}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <button type="button" disabled={!complete || busy} onClick={() => void save()}
        className="mt-4 rounded-lg bg-[#0B3D2E] px-4 py-2 text-sm font-black text-white disabled:opacity-50">
        {busy ? "Saving…" : "Save Scorer Assignments"}
      </button>
      <p className={`mt-2 text-sm font-bold ${complete ? "text-green-700" : "text-amber-700"}`}>
        {complete ? "All scorer assignments are valid." : "Every group and segment needs a scorer."}
      </p>
      {message ? <p role="status" className="mt-2 text-sm">{message}</p> : null}
    </section>
  );
}
