"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { StatisticValue } from "../../lib/dynamicStatisticsModel";
import {
  loadMobileDynamicStatistics,
  missingRequiredMobileStatistics,
  saveMobileDynamicStatistics,
  type MobileDynamicStatistics,
  type MobileStatisticItem,
} from "../../lib/services/mobileDynamicStatisticsService";
import { createOperationId } from "../../lib/services/operationIdService";

type Model = {
  tournamentId: string; tournamentRoundId: string;
  qualifyingName: string; finalized: boolean; roundNumber: number; roundName: string; holeCount: number; startingHole?: number; holeSequence?: number[];
  playerId: string; playerName: string; scorerPlayerId: string; accessRole: "scorer" | "verifier";
  groupPlayers: Array<{ player_id: string; player_name: string }>;
  holes: Array<{ player_id: string; entered_by_player_id: string; hole_number: number; strokes: number;
    fairway_hit: boolean | null; green_in_regulation: boolean | null; putts: number | null }>;
  review: { self_review_complete: boolean } | null;
  courseHoles?: Array<{ holeNumber: number; par: number; yardage: number }>;
};

export default function DesignatedQualifyingScorecard({
  playerId, roundNumber, tournamentRoundId, shareToken,
}: { playerId: string; roundNumber: number; tournamentRoundId: string; shareToken: string }) {
  const [model, setModel] = useState<Model | null>(null);
  const [hole, setHole] = useState(1);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [gir, setGir] = useState("");
  const [fairway, setFairway] = useState("");
  const [putts, setPutts] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [proposedScores, setProposedScores] = useState<string[]>([]);
  const [dynamicStatistics, setDynamicStatistics] = useState<MobileDynamicStatistics | null>(null);
  const [dynamicValues, setDynamicValues] = useState<Record<string, StatisticValue | null>>({});
  const load = useCallback(async () => {
    const query = new URLSearchParams({ shareToken, playerId, round: String(roundNumber) });
    if (tournamentRoundId) query.set("roundId", tournamentRoundId);
    const response = await fetch(`/api/qualifying-designated-scorecard?${query}`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Unable to load scorecard.");
    setModel(body);
    setDynamicStatistics(await loadMobileDynamicStatistics({
      shareToken,
      tournamentId: body.tournamentId,
      roundNumber,
      playerId,
    }));
    const scorer = body.scorerPlayerId as string;
    const firstIncomplete = Array.from({ length: body.holeCount as number }, (_, index) => index + 1)
      .find((holeNumber) => body.groupPlayers.some((player: { player_id: string }) =>
        !body.holes.some((entry: Model["holes"][number]) =>
          entry.player_id === player.player_id && entry.entered_by_player_id === scorer &&
          entry.hole_number === holeNumber && entry.strokes > 0
        ))) ?? body.holeCount;
    setHole(firstIncomplete);
    setProposedScores(Array.from({ length: body.holeCount }, (_, index) => {
      const entry = body.holes.find((row: Model["holes"][number]) =>
        row.player_id === playerId && row.entered_by_player_id === body.scorerPlayerId &&
        row.hole_number === index + 1
      );
      return entry?.strokes ? String(entry.strokes) : "";
    }));
  }, [playerId, roundNumber, shareToken, tournamentRoundId]);
  useEffect(() => { void load().catch((cause) => setError(cause.message)); }, [load]);
  useEffect(() => {
    if (!model) return;
    const designated = Object.fromEntries(model.groupPlayers.map((player) => {
      const row = model.holes.find((entry) => entry.player_id === player.player_id &&
        entry.entered_by_player_id === model.scorerPlayerId && entry.hole_number === hole);
      return [player.player_id, row?.strokes ? String(row.strokes) : ""];
    }));
    setScores(designated);
    const stats = model.holes.find((entry) => entry.player_id === playerId &&
      entry.entered_by_player_id === playerId && entry.hole_number === hole);
    setGir(stats?.green_in_regulation == null ? "" : stats.green_in_regulation ? "yes" : "no");
    setFairway(stats?.fairway_hit == null ? "" : stats.fairway_hit ? "yes" : "no");
    setPutts(stats?.putts == null ? "" : String(stats.putts));
    if (dynamicStatistics?.assignment) {
      setDynamicValues(Object.fromEntries(dynamicStatistics.items.map((item) => {
        const latest = dynamicStatistics.values
          .filter((value) => value.definitionVersionId === item.definitionVersionId && value.holeNumber === hole)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))[0];
        return [item.key, latest?.value ?? null];
      })));
    }
  }, [dynamicStatistics, hole, model, playerId]);
  const currentScores = useMemo(() => model?.groupPlayers.map((player) => Number(scores[player.player_id])) ?? [], [model, scores]);

  const save = async () => {
    if (!model) return;
    setBusy(true); setError("");
    try {
      if (dynamicStatistics?.assignment) {
        const missing = missingRequiredMobileStatistics(dynamicStatistics.items, 4, dynamicValues);
        if (missing.length > 0) throw new Error(`Complete required statistics: ${missing.map((item) => item.name).join(", ")}.`);
      }
      const response = await fetch("/api/qualifying-designated-scorecard", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shareToken, playerId, roundNumber, tournamentRoundId: model.tournamentRoundId, action: "save_hole", holeNumber: hole,
          scores: model.accessRole === "scorer" ? Object.fromEntries(
            model.groupPlayers.map((player) => [player.player_id, Number(scores[player.player_id])])
          ) : {},
          greenInRegulation: dynamicStatistics?.assignment ? undefined : gir === "" ? undefined : gir === "yes",
          fairwayHit: dynamicStatistics?.assignment ? undefined : fairway === "" ? undefined : fairway === "yes",
          putts: dynamicStatistics?.assignment ? undefined : putts === "" ? undefined : Number(putts),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to save hole.");
      if (dynamicStatistics?.assignment) {
        await saveMobileDynamicStatistics({
          shareToken,
          tournamentId: model.tournamentId,
          roundNumber,
          playerId,
          values: dynamicStatistics.items.flatMap((item) => {
            const value = dynamicValues[item.key];
            return value == null ? [] : [{
              definitionVersionId: item.definitionVersionId,
              holeNumber: hole,
              value,
              operationKey: createOperationId(),
            }];
          }),
        });
      }
      await load();
      if (hole < model.holeCount) setHole((value) => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save hole."); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    setBusy(true);
    const response = await fetch("/api/qualifying-designated-scorecard", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shareToken, playerId, roundNumber, tournamentRoundId: model?.tournamentRoundId, action: "verify" }),
    });
    setBusy(false);
    if (response.ok) await load(); else setError("Unable to verify round.");
  };
  const dispute = async () => {
    setBusy(true);
    const response = await fetch("/api/qualifying-designated-scorecard", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shareToken, playerId, roundNumber, tournamentRoundId: model?.tournamentRoundId, action: "dispute",
        proposedScores: proposedScores.map(Number),
      }),
    });
    setBusy(false);
    if (response.ok) await load(); else setError("Unable to raise discrepancy.");
  };
  if (error && !model) return <main className="flex min-h-screen items-center bg-[#F6F1E6] px-4 py-8 text-[#0B3D2E]"><div role="alert" className="mx-auto w-full max-w-lg rounded-[24px] border border-red-300 bg-red-50 p-5 font-semibold text-red-800">{error}</div></main>;
  if (!model) return <main className="min-h-screen bg-[#F6F1E6] p-6">Loading designated scorecard…</main>;
  const complete = model.groupPlayers.every((player) => model.holes.filter((entry) =>
    entry.player_id === player.player_id && entry.entered_by_player_id === model.scorerPlayerId && entry.strokes > 0
  ).length >= model.holeCount);
  return (
    <main className="min-h-screen bg-[#F6F1E6] px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(1.5rem+env(safe-area-inset-top))] text-[#0B3D2E]">
      <div className="mx-auto max-w-xl landscape:max-w-3xl">
        <p className="text-xs font-black uppercase tracking-widest text-[#B8892D]">Designated Group Scoring</p>
        <h1 className="text-2xl font-black">{model.qualifyingName}</h1>
        <p className="font-bold">{model.playerName} · {model.roundName}</p>
        {model.finalized ? <p className="mt-3 rounded-lg bg-amber-100 p-3 font-black">Read-only · Finalized</p> : null}
        <section className="mt-5 rounded-[24px] border border-[#E8DCC8] bg-white p-5 shadow-[0_18px_45px_rgba(11,61,46,0.08)]">
          <h2 className="text-xl font-black">Hole {model.holeSequence?.[hole - 1] ?? hole}</h2>
          {model.courseHoles?.find((courseHole) => courseHole.holeNumber === (model.holeSequence?.[hole - 1] ?? hole)) ? (() => {
            const courseHole = model.courseHoles!.find((candidate) => candidate.holeNumber === (model.holeSequence?.[hole - 1] ?? hole))!;
            return <p className="mt-1 text-sm font-bold text-[#51635C]">Par {courseHole.par} · {courseHole.yardage} yards</p>;
          })() : null}
          {model.accessRole === "scorer" ? (
            <div className="mt-4 space-y-3">
              {model.groupPlayers.map((player) => (
                <label key={player.player_id} className="flex items-center justify-between gap-4 font-bold">
                  {player.player_name}
                  <input aria-label={`${player.player_name} score`} inputMode="numeric"
                    value={scores[player.player_id] ?? ""} onChange={(event) =>
                      setScores((current) => ({ ...current, [player.player_id]: event.target.value.replace(/\D/g, "") }))}
                    className="min-h-12 w-20 rounded-xl border border-[#E8DCC8] p-3 text-center text-xl font-black" />
                </label>
              ))}
            </div>
          ) : <p className="mt-3">Your designated scorer records group scores. You may record your personal statistics.</p>}
          {dynamicStatistics?.assignment ? (
            dynamicStatistics.items.length > 0 ? <>
              <h3 className="mt-5 font-black">My Statistics</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {dynamicStatistics.items.map((item) => (
                  <DynamicStatisticInput key={item.definitionVersionId} item={item} value={dynamicValues[item.key] ?? null}
                    onChange={(value) => setDynamicValues((current) => ({ ...current, [item.key]: value }))} />
                ))}
              </div>
            </> : <p className="mt-5 text-sm font-semibold text-[#51635C]">Score-only Qualifying · no hole statistics selected</p>
          ) : <>
            <h3 className="mt-5 font-black">My Statistics</h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <select aria-label="Fairway Hit" value={fairway} onChange={(e) => setFairway(e.target.value)} className="rounded border p-2">
              <option value="">Fairway —</option><option value="yes">Yes</option><option value="no">No</option>
            </select>
            <select aria-label="Green in Regulation" value={gir} onChange={(e) => setGir(e.target.value)} className="rounded border p-2">
              <option value="">GIR —</option><option value="yes">Yes</option><option value="no">No</option>
            </select>
            <input aria-label="Putts" inputMode="numeric" value={putts} onChange={(e) => setPutts(e.target.value.replace(/\D/g, ""))}
              className="rounded border p-2" placeholder="Putts" />
            </div>
          </>}
          <button disabled={busy || model.finalized || (model.accessRole === "scorer" && currentScores.some((score) => !score))}
            onClick={() => void save()} className="mt-5 min-h-12 w-full rounded-full bg-[#0B3D2E] font-black text-white disabled:opacity-50">
            {busy ? "Saving…" : "Save Hole"}
          </button>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button className="min-h-12 rounded-full border border-[#B8892D] px-4 font-black disabled:opacity-40" disabled={hole === 1} onClick={() => setHole((value) => value - 1)}>Previous Hole</button>
            <button className="min-h-12 rounded-full border border-[#B8892D] px-4 font-black disabled:opacity-40" disabled={hole === model.holeCount} onClick={() => setHole((value) => value + 1)}>Next Hole</button>
          </div>
        </section>
        {complete ? (
          <section className="mt-5 rounded-[24px] border border-[#E8DCC8] bg-white p-5 shadow-[0_18px_45px_rgba(11,61,46,0.06)]">
            <h2 className="text-xl font-black">Review My Round</h2>
            <p className="mt-2">Verify the score recorded for {model.playerName}. Disagreements go to the existing Director Review Queue.</p>
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {proposedScores.map((score, index) => (
                <label key={index} className="text-center text-xs font-bold">
                  H{model.holeSequence?.[index] ?? index + 1}
                  <input aria-label={`Proposed score hole ${index + 1}`} value={score}
                    onChange={(event) => setProposedScores((current) =>
                      current.map((value, scoreIndex) => scoreIndex === index ? event.target.value.replace(/\D/g, "") : value))}
                    className="mt-1 w-full rounded border p-2 text-center" />
                </label>
              ))}
            </div>
            <button disabled={busy || model.finalized || model.review?.self_review_complete}
              onClick={() => void verify()} className="mt-4 min-h-12 w-full rounded-full bg-[#0B3D2E] px-5 py-3 font-black text-white disabled:opacity-50">
              {model.review?.self_review_complete ? "Round Verified" : "Accept Scorer-Entered Score"}
            </button>
            {model.accessRole !== "scorer" ? (
              <button disabled={busy || model.finalized || proposedScores.some((score) => !Number(score))}
                onClick={() => void dispute()} className="mt-3 min-h-12 w-full rounded-full border border-[#8A2E2E] px-5 py-3 font-black text-[#8A2E2E] disabled:opacity-50">
                Raise Discrepancy
              </button>
            ) : null}
          </section>
        ) : null}
        {error ? <p role="alert" className="mt-4 rounded-2xl border border-red-300 bg-red-50 p-3 font-semibold text-red-800">{error}</p> : null}
      </div>
    </main>
  );
}

function DynamicStatisticInput({ item, value, onChange }: {
  item: MobileStatisticItem;
  value: StatisticValue | null;
  onChange: (value: StatisticValue | null) => void;
}) {
  const label = `${item.name}${item.isRequired ? " (required)" : ""}`;
  if (item.inputType === "bounded_number") {
    return <label className="font-bold">{label}<input aria-label={item.name} type="number"
      min={item.configuration.minimum} max={item.configuration.maximum}
      value={typeof value === "number" ? value : ""}
      onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
      className="mt-1 min-h-12 w-full rounded border p-2" /></label>;
  }
  if (item.inputType === "option_list") {
    return <label className="font-bold">{label}<select aria-label={item.name}
      value={typeof value === "string" ? value : ""}
      onChange={(event) => onChange(event.target.value || null)} className="mt-1 min-h-12 w-full rounded border p-2">
      <option value="">Select…</option>{item.configuration.options?.map((option) => <option key={option} value={option}>{option}</option>)}
    </select></label>;
  }
  return <label className="font-bold">{label}<select aria-label={item.name}
    value={typeof value === "boolean" ? String(value) : ""}
    onChange={(event) => onChange(event.target.value === "" ? null : event.target.value === "true")}
    className="mt-1 min-h-12 w-full rounded border p-2">
    <option value="">Select…</option><option value="true">Yes</option><option value="false">No</option>
  </select></label>;
}
