import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  buildIndividualLeaderboard,
  buildTeamLeaderboard,
} from "../../app/lib/services/tournamentDerivedState";

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
const players = [
  { id: 1, playerName: "AJ Gerber", team: "Bluffton University", scores: [4, 5, 3, 4, 4, 5, 3, 4, 4] },
  { id: 2, playerName: "Teammate", team: "Bluffton University", scores: [5, 5, 3, 4, 4, 5, 3, 4, 5] },
];

test("authoritative round pars drive individual, Today, and team projections", () => {
  const roundPars = [4, 5, 3, 4, 4, 5, 3, 4, 4];
  const individual = buildIndividualLeaderboard({
    scorecardsGenerated: true,
    scorecardRows: players,
    displayHoleCount: 9,
    roundPars,
  });
  expect(individual[0]).toMatchObject({ totalScore: 36, toPar: "E", today: "E", through: "F" });
  expect(individual[1]).toMatchObject({ totalScore: 38, toPar: "+2", today: "+2", through: "F" });

  const team = buildTeamLeaderboard({
    scorecardsGenerated: true,
    scorecardRows: players,
    displayHoleCount: 9,
    countingScores: 2,
    roundPars,
  });
  expect(team[0]).toMatchObject({ totalScore: 74, toPar: "+2", today: "+2" });
});

test("custom seven-hole par and partial play use only authoritative played positions", () => {
  const [row] = buildIndividualLeaderboard({
    scorecardsGenerated: true,
    scorecardRows: [{ id: 1, playerName: "AJ Gerber", team: "Bluffton University", scores: [3, 0, 5, 0, 4, 0, 3] }],
    displayHoleCount: 7,
    roundPars: [3, 4, 5, 4, 4, 3, 3],
  });
  expect(row).toMatchObject({ totalScore: 15, toPar: "E", today: "E", through: "4/7" });
});

test("course editor and QR modal use responsive presentation contracts", () => {
  const editor = source("app/components/CourseSetupEditor.tsx");
  const print = source("app/tournament/[id]/components/TournamentPrintExport.tsx");
  expect(editor).toContain("Front 9");
  expect(editor).toContain("Back 9");
  expect(editor).toContain('hole.holeNumber === 10 ? "border-t-4');
  expect(print).toContain("max-w-4xl");
  expect(print).toContain("max-h-[calc(100dvh-2rem)]");
  expect(print).toContain("min-h-0 flex-1 overflow-y-auto");
  expect(print).toContain("sticky bottom-0");
  expect(print).toContain("min-h-12");
});

test("Qualifying access stays distinct and suppresses Tournament team-code prompts", () => {
  const access = source("app/tournament/[id]/components/QualifyingAccessContext.tsx");
  const print = source("app/tournament/[id]/components/TournamentPrintExport.tsx");
  expect(access).toContain("Qualifying Access");
  expect(access).toContain("Clubhouse HQ homepage");
  expect(access).toContain("separate from Tournament Team Scoring Codes");
  expect(print).toContain("!isQualifyingTournament");
});

test("reciprocal verification totals require marker-for-self completion and share event par authority", () => {
  const scorecard = source("app/scorecard/[playerId]/page.tsx");
  const comparison = source("app/lib/services/reviewComparisonService.ts");
  expect(scorecard).toContain("reciprocalVerification.scoreComparisonComplete");
  expect(scorecard).toContain("reciprocalVerification.markerTotal");
  expect(scorecard).not.toContain("markerScores.reduce((sum, score) => sum + score, 0)");
  expect(comparison).toContain("const roundPar = holes.reduce((sum, hole) => sum + hole.par, 0)");
  expect(scorecard).toContain("reviewMarkerTotals.toPar");
});
