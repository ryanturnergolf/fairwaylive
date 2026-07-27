import type {
  CreateQualifyingSessionInput,
} from "../qualifyingModel";
import {
  saveScoreEntry,
  type SaveScoreEntryInput,
} from "../repositories/scoreRepository";
import {
  saveScoreHoleEntries,
  type SaveScoreHoleEntryInput,
} from "../repositories/statisticsRepository";
import type { TournamentPlayerRow } from "../repositories/tournamentRepository";
import { activateQualifyingSession } from "./qualifyingActivationService";
import { manageQualifyingAccessCode } from "./qualifyingAccessService";
import {
  autoBalanceQualifyingGroups,
  getQualifyingRoster,
} from "./qualifyingCreationService";
import { provisionQualifyingSession } from "./qualifyingProvisioningService";
import { createQualifyingSessionDraft } from "./qualifyingSessionService";
import { getTournamentAggregate } from "./tournamentService";

export const QA_SEED_TEST_QUALIFIER_ID = "seed-test-qualifier";
export const QA_TEST_QUALIFIER_HOLE_COUNT = 9;
export const QA_TEST_QUALIFIER_COMPLETED_HOLES = 8;
const QA_TEST_QUALIFIER_PAR_THREE_HOLES = new Set([3, 7]);

export type QaSeedTemplateDefinition = {
  id: string;
  label: string;
  description: string;
};

export type QaSeedTemplateResult = {
  templateId: string;
  qualifyingSessionId: string;
  tournamentId: string;
  qualifyingCode: string;
  playerCount: number;
  pairingCount: number;
  scorecardCount: number;
  seededHoleCount: number;
  durationMs: number;
};

export type QaSeedDependencies = {
  createDraft: typeof createQualifyingSessionDraft;
  provision: typeof provisionQualifyingSession;
  activate: typeof activateQualifyingSession;
  loadTournamentPlayers: (tournamentId: string) => Promise<TournamentPlayerRow[]>;
  saveScore: typeof saveScoreEntry;
  saveHoleEntries: typeof saveScoreHoleEntries;
  ensureAccessCode: (qualifyingSessionId: string) => Promise<{ code: string }>;
  now: () => number;
};

export const qaSeedTemplates: QaSeedTemplateDefinition[] = [
  {
    id: QA_SEED_TEST_QUALIFIER_ID,
    label: "Seed Test Qualifier",
    description: "Creates a six-player, nine-hole reciprocal qualifier with only Hole 9 left to play.",
  },
];

const testQualifierPlayers = () => getQualifyingRoster("men").slice(0, 6);

export const buildTestQualifierDraft = (
  timestamp = new Date().toISOString()
): CreateQualifyingSessionInput => {
  const selectedPlayers = testQualifierPlayers();
  return {
    name: `QA Test Qualifier ${timestamp}`,
    rosterType: "men",
    scoringMode: "reciprocal",
    selectedPlayers,
    groups: autoBalanceQualifyingGroups(selectedPlayers, 2),
    days: [
      {
        dayNumber: 1,
        playDate: "2026-08-01",
        holesTotal: 9,
        courseName: "Clubhouse QA Course",
        teeName: "QA Tees",
        startingHole: 1,
      },
    ],
  };
};

const buildPlayerScores = (players: TournamentPlayerRow[]) =>
  new Map(
    players.map((player, playerIndex) => [
      player.player_id,
      Array.from({ length: QA_TEST_QUALIFIER_HOLE_COUNT }, (_, index) =>
        index < QA_TEST_QUALIFIER_COMPLETED_HOLES
          ? 3 + ((index + playerIndex) % 3)
          : 0
      ),
    ])
  );

export const buildTestQualifierScoringSeed = ({
  tournamentId,
  players,
}: {
  tournamentId: string;
  players: TournamentPlayerRow[];
}): {
  scoreEntries: SaveScoreEntryInput[];
  holeEntries: SaveScoreHoleEntryInput[];
} => {
  if (players.length !== 6) {
    throw new Error("Seed Test Qualifier requires exactly six provisioned players.");
  }
  if (players.some((player) => !player.marker_player_id || !player.group_number)) {
    throw new Error("Seed Test Qualifier requires completed reciprocal pairings.");
  }

  const scoresByPlayer = buildPlayerScores(players);
  const scoreEntries = players.flatMap((scorer) => {
    const markedPlayerId = String(scorer.marker_player_id);
    return [scorer.player_id, markedPlayerId].map((playerId) => {
      const holeScores = [...(scoresByPlayer.get(playerId) ?? [])];
      return {
        tournamentId,
        roundNumber: 1,
        playerId,
        enteredByPlayerId: scorer.player_id,
        holeScores,
        total: holeScores.reduce((total, score) => total + score, 0),
        entryStatus: "live",
        submittedAt: null,
      };
    });
  });
  const holeEntries = players.flatMap((scorer, scorerIndex) => {
    const markedPlayerId = String(scorer.marker_player_id);
    return Array.from(
      { length: QA_TEST_QUALIFIER_COMPLETED_HOLES },
      (_, index) => index + 1
    ).flatMap((holeNumber) => {
      const selfScore = scoresByPlayer.get(scorer.player_id)?.[holeNumber - 1] ?? 4;
      const markerScore = scoresByPlayer.get(markedPlayerId)?.[holeNumber - 1] ?? 4;
      return [
        {
          tournamentId,
          roundNumber: 1,
          playerId: scorer.player_id,
          enteredByPlayerId: scorer.player_id,
          markerForPlayerId: null,
          holeNumber,
          strokes: selfScore,
          fairwayHit: QA_TEST_QUALIFIER_PAR_THREE_HOLES.has(holeNumber)
            ? null
            : (holeNumber + scorerIndex) % 2 === 0,
          greenInRegulation: (holeNumber + scorerIndex) % 3 !== 0,
          putts: 1 + ((holeNumber + scorerIndex) % 2),
          penaltyStrokes: null,
          entrySource: "self",
          entryStatus: "live",
        },
        {
          tournamentId,
          roundNumber: 1,
          playerId: markedPlayerId,
          enteredByPlayerId: scorer.player_id,
          markerForPlayerId: markedPlayerId,
          holeNumber,
          strokes: markerScore,
          fairwayHit: null,
          greenInRegulation: null,
          putts: null,
          penaltyStrokes: null,
          entrySource: "marker",
          entryStatus: "live",
        },
      ];
    });
  });

  return { scoreEntries, holeEntries };
};

const defaultDependencies: QaSeedDependencies = {
  createDraft: createQualifyingSessionDraft,
  provision: provisionQualifyingSession,
  activate: activateQualifyingSession,
  loadTournamentPlayers: async (tournamentId) => {
    const aggregate = await getTournamentAggregate(tournamentId);
    return aggregate?.tournamentPlayers.filter((player) => player.round_number === 1) ?? [];
  },
  saveScore: saveScoreEntry,
  saveHoleEntries: saveScoreHoleEntries,
  ensureAccessCode: async (qualifyingSessionId) =>
    manageQualifyingAccessCode(qualifyingSessionId, "ensure"),
  now: () => Date.now(),
};

const seedTestQualifier = async (
  dependencies: QaSeedDependencies
): Promise<QaSeedTemplateResult> => {
  const startedAt = dependencies.now();
  const draft = await dependencies.createDraft(buildTestQualifierDraft());
  const provisioned = await dependencies.provision(draft.id);
  const activated = await dependencies.activate(draft.id);
  const players = await dependencies.loadTournamentPlayers(provisioned.tournamentId);
  const scoringSeed = buildTestQualifierScoringSeed({
    tournamentId: provisioned.tournamentId,
    players,
  });

  await Promise.all(scoringSeed.scoreEntries.map((entry) => dependencies.saveScore(entry)));
  await dependencies.saveHoleEntries(scoringSeed.holeEntries);
  const access = await dependencies.ensureAccessCode(draft.id);

  return {
    templateId: QA_SEED_TEST_QUALIFIER_ID,
    qualifyingSessionId: draft.id,
    tournamentId: provisioned.tournamentId,
    qualifyingCode: access.code,
    playerCount: players.length,
    pairingCount: activated.pairingCount,
    scorecardCount: activated.scorecardCount,
    seededHoleCount: QA_TEST_QUALIFIER_COMPLETED_HOLES,
    durationMs: Math.max(0, dependencies.now() - startedAt),
  };
};

const templateRunners: Record<
  string,
  (dependencies: QaSeedDependencies) => Promise<QaSeedTemplateResult>
> = {
  [QA_SEED_TEST_QUALIFIER_ID]: seedTestQualifier,
};

export const runQaSeedTemplate = async (
  templateId: string,
  dependencies: QaSeedDependencies = defaultDependencies
) => {
  const runner = templateRunners[templateId];
  if (!runner) throw new Error("Unknown QA seed template.");
  return runner(dependencies);
};
