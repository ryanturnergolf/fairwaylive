"use client";

import Link from "next/link";
import { CoachBreadcrumbs, CoachHeader } from "../components/CoachChrome";
import { useEffect, useState } from "react";
import type { QualifyingSessionFoundation } from "../../lib/qualifyingModel";
import { activateQualifyingSession } from "../../lib/services/qualifyingActivationService";
import { provisionQualifyingSession } from "../../lib/services/qualifyingProvisioningService";
import {
  getQualifyingTournamentWorkspaceHref,
  listQualifyingSessionFoundations,
  loadQualifyingResults,
} from "../../lib/services/qualifyingSessionService";
import { advanceQualifyingOperationalRound, buildQualifyingRoundProgressionState, loadQualifyingRoundProgressionState, type QualifyingRoundProgressionState } from "../../lib/services/qualifyingRoundProgressionService";
import QualifyingAccessPanel from "./QualifyingAccessPanel";
import QualifyingResultsPanel from "./QualifyingResultsPanel";
import DesignatedScorerAssignments from "./DesignatedScorerAssignments";

export default function QualifyingSessionsPage() {
  const [sessions, setSessions] = useState<QualifyingSessionFoundation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [provisioningId, setProvisioningId] = useState("");
  const [activatingId, setActivatingId] = useState("");
  const [provisionedTournamentIds, setProvisionedTournamentIds] = useState<Record<string, string>>({});
  const [operationalRoundMessage, setOperationalRoundMessage] = useState<Record<string, string>>({});
  const [roundProgression, setRoundProgression] = useState<Record<string, QualifyingRoundProgressionState | null>>({});
  const [advancingId, setAdvancingId] = useState("");

  useEffect(() => {
    let cancelled = false;
    void listQualifyingSessionFoundations()
      .then((loaded) => {
        if (!cancelled) {
          setSessions(loaded);
          void Promise.all(loaded.filter((foundation) => foundation.session.status === "active").map(async (foundation) => {
            try {
              const progression = await loadQualifyingRoundProgressionState(foundation);
              if (!cancelled) setRoundProgression((current) => ({ ...current, [foundation.session.id]: progression }));
            } catch {
              if (!cancelled) setRoundProgression((current) => ({ ...current, [foundation.session.id]: null }));
            }
          }));
        }
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load qualifying sessions.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleProvision = async (qualifyingSessionId: string) => {
    setError("");
    setProvisioningId(qualifyingSessionId);
    try {
      const result = await provisionQualifyingSession(qualifyingSessionId);
      setProvisionedTournamentIds((current) => ({
        ...current,
        [qualifyingSessionId]: result.tournamentId,
      }));
      setSessions((current) =>
        current.map((foundation) =>
          foundation.session.id === qualifyingSessionId
            ? {
                ...foundation,
                session: {
                  ...foundation.session,
                  tournamentId: result.tournamentId,
                  status: result.status,
                },
              }
            : foundation
        )
      );
    } catch (provisionError) {
      setError(
        provisionError instanceof Error
          ? provisionError.message
          : "Unable to provision qualifying."
      );
    } finally {
      setProvisioningId("");
    }
  };

  const handleActivate = async (qualifyingSessionId: string) => {
    setError("");
    setActivatingId(qualifyingSessionId);
    try {
      const result = await activateQualifyingSession(qualifyingSessionId);
      setSessions((current) =>
        current.map((foundation) =>
          foundation.session.id === qualifyingSessionId
            ? {
                ...foundation,
                session: { ...foundation.session, status: result.status },
              }
            : foundation
        )
      );
    } catch (activationError) {
      setError(
        activationError instanceof Error
          ? activationError.message
          : "Unable to activate qualifying."
      );
    } finally {
      setActivatingId("");
    }
  };

  const handleCompleteRound = async (foundation: QualifyingSessionFoundation, progression: QualifyingRoundProgressionState) => {
    const next = progression.nextRound;
    if (!next || !progression.ready) return;
    const message = next.qualifyingDay !== progression.dayNumber
      ? `Complete ${progression.displayLabel}? This will make ${next.displayLabel} / Day ${next.qualifyingDay} available when players use the same Qualifying scoring code.`
      : `Complete ${progression.displayLabel}? ${next.displayLabel} is already available to players today and will become the current scoring round.`;
    if (!window.confirm(message)) return;
    setAdvancingId(foundation.session.id);
    try {
      const updated = await advanceQualifyingOperationalRound(foundation.session.id, progression.currentQualifyingRoundId);
      setSessions((current) => current.map((item) => item.session.id === foundation.session.id
        ? {
            ...item,
            session: {
              ...item.session,
              operationalCurrentQualifyingRoundId: String(updated.newQualifyingRoundId),
            },
          }
        : item));
      setOperationalRoundMessage((current) => ({ ...current, [foundation.session.id]: `${next.displayLabel} is now the current scoring round.` }));
      const refreshed = { ...foundation, session: { ...foundation.session, operationalCurrentQualifyingRoundId: String(updated.newQualifyingRoundId) } };
      const results = await loadQualifyingResults(foundation.session.id);
      setRoundProgression((current) => ({ ...current, [foundation.session.id]: buildQualifyingRoundProgressionState(refreshed, results) }));
    } catch (cause) {
      setOperationalRoundMessage((current) => ({
        ...current,
        [foundation.session.id]: cause instanceof Error ? cause.message : "Unable to complete the current scoring round.",
      }));
    } finally {
      setAdvancingId("");
    }
  };

  const handleOperationalRoundChange = async (qualifyingSessionId: string, qualifyingRoundId: string) => {
    const foundation = sessions.find((item) => item.session.id === qualifyingSessionId);
    const progression = roundProgression[qualifyingSessionId];
    if (!foundation || !progression || progression.nextRound?.qualifyingRoundId !== qualifyingRoundId) {
      setOperationalRoundMessage((current) => ({ ...current, [qualifyingSessionId]: "Rounds advance in order after the current round is complete." }));
      return;
    }
    await handleCompleteRound(foundation, progression);
  };

  return (
    <main className="min-h-screen bg-[#F6F1E6] text-[#0B3D2E]">
      <CoachHeader />
      <header className="hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link href="/" className="font-black">Clubhouse HQ</Link>
          <Link href="/coach-dashboard" className="text-sm font-bold text-[#51635C]">Coach Dashboard</Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        <CoachBreadcrumbs items={[{ label: "Coach Dashboard", href: "/coach-dashboard" }, { label: "Qualifying Sessions" }]} />
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#B8892D]">Coach Workflow</p>
            <h1 className="mt-2 text-4xl font-black tracking-tight">Qualifying Sessions</h1>
            <p className="mt-3 max-w-2xl text-[#51635C]">
              Build and save qualifying setup drafts. Tournament rounds, scorecards, access, and scoring are not created yet.
            </p>
          </div>
          <Link
            href="/coach-dashboard/qualifying-manager/new"
            className="rounded-lg bg-[#0B3D2E] px-5 py-3 text-center text-sm font-black text-white"
          >
            Create Qualifying
          </Link>
        </div>

        <section className="mt-8 rounded-lg border border-[#E8DCC8] bg-white p-5">
          {isLoading ? (
            <p className="text-sm font-semibold text-[#51635C]">Loading qualifying sessions…</p>
          ) : error ? (
            <p role="alert" className="text-sm font-semibold text-[#8A2E2E]">{error}</p>
          ) : sessions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#D9D0C0] bg-[#FCFAF5] px-5 py-10 text-center">
              <h2 className="text-xl font-black">No qualifying sessions yet</h2>
              <p className="mt-2 text-sm text-[#51635C]">Create the first coach setup draft when you are ready.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {sessions.map((foundation) => {
                const { session, days } = foundation;
                const progression = roundProgression[session.id];
                const designatedReady = session.scoringMode !== "designated_scorer" ||
                  foundation.rounds.length * session.groups.length === foundation.scorerAssignments.length;
                return (
                <article key={session.id} className="rounded-lg border border-[#E8DCC8] bg-[#FCFAF5] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-black">{session.name}</h2>
                      <p className="mt-1 text-sm text-[#51635C]">
                        {session.rosterType === "men" ? "Men's" : "Women's"} · {session.selectedPlayers.length} players · {days.length} {days.length === 1 ? "day" : "days"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {session.status === "provisioned" ? (
                        <button
                          type="button"
                          disabled={activatingId === session.id || !designatedReady}
                          aria-disabled={!designatedReady}
                          onClick={() => void handleActivate(session.id)}
                          className="rounded-lg bg-[#0B3D2E] px-3 py-2 text-xs font-black text-white disabled:opacity-60"
                        >
                          {activatingId === session.id
                            ? "Activating..."
                            : designatedReady ? "Generate Pairings & Scorecards" : "Assign Scorers First"}
                        </button>
                      ) : !session.tournamentId ? (
                        <button
                          type="button"
                          disabled={provisioningId === session.id}
                          onClick={() => void handleProvision(session.id)}
                          className="rounded-lg bg-[#0B3D2E] px-3 py-2 text-xs font-black text-white disabled:opacity-60"
                        >
                          {provisioningId === session.id
                            ? "Provisioning..."
                            : "Provision Tournament"}
                        </button>
                      ) : null}
                      {session.tournamentId || provisionedTournamentIds[session.id] ? (
                        <Link
                          href={getQualifyingTournamentWorkspaceHref(
                            session.tournamentId || provisionedTournamentIds[session.id]
                          )}
                          className="rounded-lg border border-[#0B3D2E] px-3 py-2 text-xs font-black"
                        >
                          Open Tournament
                        </Link>
                      ) : null}
                      <span className="rounded-full border border-[#E8DCC8] bg-white px-3 py-1 text-xs font-black uppercase">
                        {session.status}
                      </span>
                    </div>
                  </div>
                  {session.scoringMode === "designated_scorer" && session.status === "provisioned" ? (
                    <DesignatedScorerAssignments
                      foundation={foundation}
                      onSaved={(assignments) => setSessions((current) => current.map((item) =>
                        item.session.id === session.id ? { ...item, scorerAssignments: assignments } : item
                      ))}
                    />
                  ) : null}
                  {session.status === "active" && (foundation.configuredRounds?.length ?? 0) > 1 ? (
                    <div className="mt-4 rounded-lg border border-[#D6E0D8] bg-white p-4">
                      <label className="block text-xs font-black uppercase tracking-[0.2em] text-[#51635C]">
                        Current Scoring Round
                        <select
                          disabled
                          value={session.operationalCurrentQualifyingRoundId ?? ""}
                          onChange={(event) => void handleOperationalRoundChange(session.id, event.target.value)}
                          className="mt-2 min-h-12 w-full rounded-lg border border-[#D6E0D8] bg-white px-3 text-sm font-black text-[#0B3D2E]"
                        >
                          <option value="" disabled>Select a configured round</option>
                          {foundation.configuredRounds?.map((round) => (
                            <option key={round.qualifyingRoundId} value={round.qualifyingRoundId}>
                              {round.displayLabel} · Day {round.qualifyingDay} · Segment {round.qualifyingSegment}
                            </option>
                          ))}
                        </select>
                      </label>
                      {progression ? (
                        <div className="mt-3 border-t border-[#D6E0D8] pt-3">
                          <p className="text-sm font-black">{progression.displayLabel} · Day {progression.dayNumber} · Segment {progression.segmentNumber}</p>
                          <p className="mt-1 text-sm font-semibold text-[#51635C]">{progression.completeScorecards} of {progression.requiredScorecards} scorecards complete</p>
                          {progression.isFinalRound ? (
                            <p className="mt-3 text-sm font-bold">Use the existing Qualifying finalization action when the final round is ready.</p>
                          ) : (
                            <button type="button" disabled={!progression.ready || advancingId === session.id}
                              onClick={() => void handleCompleteRound(foundation, progression)}
                              className="mt-3 min-h-12 w-full rounded-lg bg-[#0B3D2E] px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
                              {advancingId === session.id ? "Completing…" : `Complete ${progression.displayLabel}`}
                            </button>
                          )}
                        </div>
                      ) : <p className="mt-3 text-sm font-semibold text-[#51635C]">Loading current-round readiness…</p>}
                      {operationalRoundMessage[session.id] ? (
                        <p role="status" className="mt-2 text-sm font-semibold text-[#51635C]">
                          {operationalRoundMessage[session.id]}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {["active", "finalized"].includes(session.status) ? (
                    <>
                      {session.status === "active" ? (
                        <QualifyingAccessPanel sessionId={session.id} />
                      ) : null}
                      {session.tournamentId ? (
                        <QualifyingResultsPanel
                          sessionId={session.id}
                          tournamentId={session.tournamentId}
                          sessionStatus={session.status}
                          operationalCurrentRoundId={foundation.configuredRounds?.find(
                            (round) => round.qualifyingRoundId === session.operationalCurrentQualifyingRoundId
                          )?.tournamentRoundId ?? null}
                          onResultsLoaded={(results) => setRoundProgression((current) => ({
                            ...current,
                            [session.id]: buildQualifyingRoundProgressionState(foundation, results),
                          }))}
                          onFinalized={() => {
                            setSessions((current) =>
                              current.map((foundation) =>
                                foundation.session.id === session.id
                                  ? {
                                      ...foundation,
                                      session: { ...foundation.session, status: "finalized" },
                                    }
                                  : foundation
                              )
                            );
                          }}
                        />
                      ) : null}
                    </>
                  ) : null}
                </article>
              )})}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
