import {
  loadCoachOnboardingPreference,
  saveCoachOnboardingPreference,
  type CoachOnboardingPreference,
} from "../repositories/coachOnboardingRepository";
import type { TournamentReadiness } from "./tournamentReadinessService";

export type CoachOnboardingContext = {
  tournamentCount: number;
  finalizedTournamentCount: number;
  rosterPlayerCount: number;
  readiness: TournamentReadiness | null;
  tournamentHref: string;
};

export type CoachOnboardingStep = {
  id: string;
  label: string;
  detail: string;
  href: string;
  complete: boolean;
};

export type CoachOnboardingReadModel = {
  visible: boolean;
  dismissed: boolean;
  experiencedCoach: boolean;
  steps: CoachOnboardingStep[];
  readinessChecks: CoachOnboardingStep[];
};

export const buildCoachOnboardingReadModel = (
  context: CoachOnboardingContext,
  preference: CoachOnboardingPreference | null
): CoachOnboardingReadModel => {
  const readiness = context.readiness;
  const experiencedCoach = context.finalizedTournamentCount > 0 || Boolean(readiness?.isSafeToShare);
  const explicitlyActive = preference?.state === "active";
  const dismissed = preference?.state === "dismissed";
  const tournamentHref = context.tournamentHref || "/dashboard";
  const steps: CoachOnboardingStep[] = [
    { id: "roster", label: "Set up your roster", detail: "Add the players who will compete this season.", href: "/coach-dashboard/roster", complete: context.rosterPlayerCount > 0 },
    { id: "statistics", label: "Choose statistics", detail: "Use the defaults or configure the statistics your team tracks.", href: "/coach-dashboard/statistics", complete: context.tournamentCount > 0 },
    { id: "event", label: "Choose Tournament or Qualifying", detail: "Use Tournament for events and Qualifying for team selection.", href: "/dashboard", complete: context.tournamentCount > 0 },
    { id: "setup", label: "Add teams and players", detail: "Confirm the event roster before creating groups.", href: tournamentHref, complete: Boolean(readiness?.checks.playersSynced) },
    { id: "pairings", label: "Create pairings", detail: "Assign every player to a group.", href: tournamentHref, complete: Boolean(readiness?.checks.pairingsGenerated) },
    { id: "scorecards", label: "Generate scorecards", detail: "Create the certified mobile scorecards.", href: tournamentHref, complete: Boolean(readiness?.checks.scorecardsGenerated) },
    { id: "share", label: "Share player access", detail: "Distribute QR links or scoring codes only after readiness is Ready.", href: tournamentHref, complete: Boolean(readiness?.isSafeToShare) },
    { id: "review", label: "Review submitted scores", detail: "Use the existing Review Queue to resolve differences.", href: tournamentHref, complete: context.finalizedTournamentCount > 0 },
    { id: "finalize", label: "Finalize the event", detail: "Finalize only after readiness and Review are complete.", href: tournamentHref, complete: context.finalizedTournamentCount > 0 },
  ];
  const readinessChecks: CoachOnboardingStep[] = readiness
    ? [
        { id: "ready-players", label: "Players synced", detail: "Tournament player identities are ready.", href: tournamentHref, complete: readiness.checks.playersSynced },
        { id: "ready-pairings", label: "Pairings generated", detail: "Every scorecard route has a group.", href: tournamentHref, complete: readiness.checks.pairingsGenerated },
        { id: "ready-scorecards", label: "Scorecards generated", detail: "Durable scorecards are available.", href: tournamentHref, complete: readiness.checks.scorecardsGenerated },
        { id: "ready-share", label: "Safe to share", detail: "Existing readiness reports this event Ready.", href: tournamentHref, complete: readiness.isSafeToShare },
      ]
    : [];

  return {
    visible: explicitlyActive || (!dismissed && !experiencedCoach),
    dismissed,
    experiencedCoach,
    steps,
    readinessChecks,
  };
};

export const loadCoachOnboardingReadModel = async (context: CoachOnboardingContext) =>
  buildCoachOnboardingReadModel(context, await loadCoachOnboardingPreference());

export const dismissCoachOnboarding = () => saveCoachOnboardingPreference("dismissed");
export const resumeCoachOnboarding = () => saveCoachOnboardingPreference("active");
