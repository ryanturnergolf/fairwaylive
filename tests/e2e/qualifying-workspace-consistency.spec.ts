import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getQualifyingTournamentWorkspaceHref } from "../../app/lib/services/qualifyingSessionService";

const source = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), "utf8");

test("every Qualifying workspace action uses the canonical backing Tournament route", () => {
  const tournamentId = "11ddab64-36fa-4522-b9b5-cb07372bd214";
  expect(getQualifyingTournamentWorkspaceHref(tournamentId)).toBe(`/tournament/${tournamentId}`);
  expect(source("app/coach-dashboard/qualifying-manager/page.tsx"))
    .toContain("getQualifyingTournamentWorkspaceHref(");
  expect(source("app/coach-dashboard/qualifying-manager/QualifyingResultsPanel.tsx"))
    .toContain("getQualifyingTournamentWorkspaceHref(effectiveTournamentId)");
});

test("Tournament hydration always verifies durable round and scorecard coverage", () => {
  const tournamentService = source("app/lib/services/tournamentService.ts");
  expect(tournamentService).toContain("getTournamentRounds(sharedTournamentUuidOrId)");
  expect(tournamentService).toContain("getTournamentScorecards(sharedTournamentUuidOrId, roundNumber)");
  expect(tournamentService).not.toContain("snapshotHasCompleteCollections");
  expect(tournamentService).toContain("envelope.tournament.players.length !== playerRows.length");
  expect(tournamentService).toContain("snapshotPairingPlayers.length !== durablePairedRows.length");
});

test("backing Tournament context resolves the existing Qualifying code boundary", () => {
  const route = source("app/api/qualifying-access-codes/route.ts");
  const service = source("app/lib/services/qualifyingAccessService.ts");
  const component = source("app/tournament/[id]/components/QualifyingAccessContext.tsx");
  expect(route).toContain(".eq(\"tournament_id\", backingTournamentId)");
  expect(route).toContain("generateQualifyingCode(session.id, data.generation)");
  expect(service).toContain("/api/qualifying-access-codes?backingTournamentId=");
  expect(component).toContain("Qualifying access code:");
  expect(component).toContain("separate from Tournament Team Scoring Codes");
});

test("Qualifying access context remains distinct from Tournament team-code management", () => {
  const contextComponent = source("app/tournament/[id]/components/QualifyingAccessContext.tsx");
  const teamCodes = source("app/tournament/[id]/components/TeamScoringCodes.tsx");
  expect(contextComponent).not.toContain("loadTeamTournamentCodes");
  expect(contextComponent).not.toContain("regenerateTeamTournamentCode");
  expect(teamCodes).toContain("Team Scoring Codes");
  expect(teamCodes).not.toContain("Qualifying access code");
});
