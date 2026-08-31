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
  changeQualifyingOperationalRound,
} from "../../lib/services/qualifyingSessionService";
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

  useEffect(() => {
    let cancelled = false;
    void listQualifyingSessionFoundations()
      .then((loaded) => {
        if (!cancelled) setSessions(loaded);
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

  const handleOperationalRoundChange = async (qualifyingSessionId: string, qualifyingRoundId: string) => {
    try {
      const updated = await changeQualifyingOperationalRound(qualifyingSessionId, qualifyingRoundId);
      setSessions((current) => current.map((foundation) => foundation.session.id === qualifyingSessionId
        ? {
            ...foundation,
            session: {
              ...foundation.session,
              operationalCurrentQualifyingRoundId: updated.operational_current_qualifying_round_id,
            },
          }
        : foundation));
      setOperationalRoundMessage((current) => ({ ...current, [qualifyingSessionId]: "Current scoring round updated." }));
    } catch (cause) {
      setOperationalRoundMessage((current) => ({
        ...current,
        [qualifyingSessionId]: cause instanceof Error ? cause.message : "Unable to update the current scoring round.",
      }));
    }
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
