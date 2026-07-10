import { loadTournamentStorageEnvelope, type StoredTournament } from "../tournamentStorage";
import type { TournamentStorageEnvelope } from "../tournamentModel";
import { loadSeasonStatisticsReadModels } from "./seasonStatisticsService";
import {
  loadDirectorDashboardReadModel,
  type DirectorTournamentSummary,
} from "./tournamentDirectorDashboardService";
import {
  loadSharedTournamentAggregates,
  type TournamentAggregate,
} from "./tournamentService";
import { loadPracticePlannerReadModel } from "./practicePlannerService";

export type CoachDashboardListItem = {
  id: string;
  title: string;
  detail: string;
  meta: string;
  href: string;
};

export type CoachDashboardMetric = {
  label: string;
  value: string;
  detail: string;
};

export type CoachDashboardAlert = {
  id: string;
  title: string;
  detail: string;
  severity: "info" | "warning" | "critical";
  href: string;
};

export type CoachDashboardAction = {
  label: string;
  href: string;
  detail: string;
  enabled: boolean;
};

export type CoachDashboardReadModel = {
  generatedAt: string;
  today: {
    currentDate: string;
    upcomingPractices: CoachDashboardListItem[];
    upcomingTournaments: CoachDashboardListItem[];
    tasksRequiringAttention: CoachDashboardListItem[];
    activeTournaments: CoachDashboardListItem[];
  };
  quickActions: CoachDashboardAction[];
  programSnapshot: {
    metrics: CoachDashboardMetric[];
    recentResults: CoachDashboardListItem[];
  };
  alerts: CoachDashboardAlert[];
  recentActivity: {
    recentlyEditedTournaments: CoachDashboardListItem[];
    recentlyFinalizedTournaments: CoachDashboardListItem[];
    recentlyCompletedPractices: CoachDashboardListItem[];
    recentPlayerUpdates: CoachDashboardListItem[];
  };
};

type TournamentSource = {
  id: string;
  sharedTournamentId: string;
  name: string;
  course: string;
  date: string;
  status: string;
  href: string;
  updatedAt: string | null;
  finalizedAt: string | null;
  players: Array<{ id: string; name: string; teamName: string }>;
  teams: Array<{ id: string; name: string }>;
};

const emptyPlaceholder = (id: string, title: string, detail: string): CoachDashboardListItem => ({
  id,
  title,
  detail,
  meta: "Placeholder",
  href: "#",
});

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

const asString = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);

const asTimestamp = (value: string | null | undefined) => {
  const timestamp = Date.parse(value ?? "");
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(value);

const formatShortDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "No date set";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

const formatTimestamp = (value: string | null) => {
  if (!value) {
    return "No recent sync";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "No recent sync";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const isSameOrFutureDate = (value: string, today: Date) => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return date.getTime() >= startOfToday.getTime();
};

const getFinalizedAt = (settings: unknown) => {
  const finalization = asRecord(asRecord(settings)?.finalization);
  return finalization?.isFinalized ? asString(finalization.finalizedAt) : null;
};

const getTournamentHref = (id: string) => `/tournament/${encodeURIComponent(id)}`;

const getAggregatePlayerName = (aggregate: TournamentAggregate, playerId: string) => {
  const modelPlayer = aggregate.players.find((player) => String(player.id) === String(playerId));
  const legacyPlayer = aggregate.uiState?.players.find((player) => String(player.id) === String(playerId));
  const row = aggregate.tournamentPlayers.find((player) => String(player.player_id) === String(playerId));

  return (
    row?.player_name ||
    [modelPlayer?.firstName, modelPlayer?.lastName].filter(Boolean).join(" ") ||
    [legacyPlayer?.firstName, legacyPlayer?.lastName].filter(Boolean).join(" ") ||
    playerId
  );
};

const getEnvelopePlayerName = (envelope: TournamentStorageEnvelope, playerId: string) => {
  const player = envelope.tournament.players.find((item) => String(item.id) === String(playerId));
  return [player?.firstName, player?.lastName].filter(Boolean).join(" ") || playerId;
};

const getEnvelopePlayers = (envelope: TournamentStorageEnvelope | null) =>
  envelope?.tournament.players.map((player) => {
    const team = envelope.tournament.teams.find((item) => item.id === player.teamId);
    return {
      id: String(player.id),
      name: getEnvelopePlayerName(envelope, String(player.id)),
      teamName: team?.name || asString(player.statistics.teamName, "Unassigned"),
    };
  }) ?? [];

const getAggregatePlayers = (aggregate: TournamentAggregate) => {
  const playerRows = aggregate.tournamentPlayers.map((player) => ({
    id: String(player.player_id),
    name: player.player_name || getAggregatePlayerName(aggregate, String(player.player_id)),
    teamName: player.team_name || "Unassigned",
  }));

  if (playerRows.length > 0) {
    return playerRows;
  }

  return aggregate.players.map((player) => {
    const team = aggregate.teams.find((item) => item.id === player.teamId);
    return {
      id: String(player.id),
      name: getAggregatePlayerName(aggregate, String(player.id)),
      teamName: team?.name || asString(player.statistics.teamName, "Unassigned"),
    };
  });
};

const getTournamentSourceFromLocal = (tournament: StoredTournament): TournamentSource => {
  const envelope = loadTournamentStorageEnvelope(tournament.id);
  const settings = envelope?.tournament.settings ?? tournament.settings;

  return {
    id: tournament.id,
    sharedTournamentId: "",
    name: tournament.name || envelope?.tournament.name || "Tournament",
    course: tournament.course || envelope?.tournament.course || "",
    date: tournament.date,
    status: tournament.status,
    href: getTournamentHref(tournament.id),
    updatedAt: null,
    finalizedAt: getFinalizedAt(settings),
    players: getEnvelopePlayers(envelope),
    teams: envelope?.tournament.teams.map((team) => ({ id: String(team.id), name: team.name })) ?? [],
  };
};

const getTournamentSourceFromAggregate = (aggregate: TournamentAggregate): TournamentSource => {
  const id = aggregate.localTournamentId || aggregate.tournamentId || aggregate.sharedTournamentId;

  return {
    id,
    sharedTournamentId: aggregate.sharedTournamentId,
    name: aggregate.tournament.name || aggregate.envelope?.tournament.name || "Tournament",
    course: aggregate.tournament.course || aggregate.envelope?.tournament.course || "",
    date: aggregate.tournament.date,
    status: aggregate.tournament.status,
    href: getTournamentHref(id || aggregate.sharedTournamentId),
    updatedAt: aggregate.snapshotUpdatedAt,
    finalizedAt: getFinalizedAt(aggregate.envelope?.tournament.settings ?? aggregate.tournament.settings),
    players: getAggregatePlayers(aggregate),
    teams: aggregate.teams.map((team) => ({ id: String(team.id), name: team.name })),
  };
};

const mergeTournamentSources = (
  localTournaments: StoredTournament[],
  aggregates: TournamentAggregate[]
) => {
  const sourcesByKey = new Map<string, TournamentSource>();

  aggregates.forEach((aggregate) => {
    const source = getTournamentSourceFromAggregate(aggregate);
    sourcesByKey.set(source.sharedTournamentId || source.id, source);
  });

  localTournaments.forEach((tournament) => {
    const source = getTournamentSourceFromLocal(tournament);
    sourcesByKey.set(source.id, {
      ...sourcesByKey.get(source.id),
      ...source,
      sharedTournamentId: sourcesByKey.get(source.id)?.sharedTournamentId ?? source.sharedTournamentId,
      updatedAt: sourcesByKey.get(source.id)?.updatedAt ?? source.updatedAt,
      players: source.players.length > 0 ? source.players : sourcesByKey.get(source.id)?.players ?? [],
      teams: source.teams.length > 0 ? source.teams : sourcesByKey.get(source.id)?.teams ?? [],
    });
  });

  return [...sourcesByKey.values()];
};

const toTournamentListItem = (source: TournamentSource, meta: string): CoachDashboardListItem => ({
  id: source.id || source.sharedTournamentId,
  title: source.name,
  detail: [source.course, formatShortDate(source.date)].filter(Boolean).join(" - ") || "Tournament",
  meta,
  href: source.href,
});

const isActiveTournament = (source: TournamentSource, summary: DirectorTournamentSummary | undefined) => {
  const status = source.status.toLowerCase();
  return (
    ["active", "live", "in progress", "playing", "test"].includes(status) ||
    Boolean(summary && (summary.groupsStarted > 0 || summary.groupsInProgress > 0) && !source.finalizedAt)
  );
};

const buildQuickActions = (): CoachDashboardAction[] => [
  { label: "Tasks", href: "/coach-dashboard/tasks", detail: "Open unified attention queue", enabled: true },
  { label: "Calendar", href: "/coach-dashboard/calendar", detail: "Open unified program schedule", enabled: true },
  { label: "Create Tournament", href: "/dashboard", detail: "Open tournament setup", enabled: true },
  { label: "Practice Planner", href: "/coach-dashboard/practice-planner", detail: "Organize upcoming practices", enabled: true },
  {
    label: "Qualifying Manager",
    href: "/coach-dashboard/qualifying-manager",
    detail: "Review qualifying sessions",
    enabled: true,
  },
  {
    label: "Player Development",
    href: "/coach-dashboard/player-development",
    detail: "Review plans, goals, skills, and notes",
    enabled: true,
  },
  { label: "View Statistics", href: "/dashboard/season-statistics", detail: "Open statistics workspace", enabled: true },
  { label: "Season Statistics", href: "/dashboard/season-statistics", detail: "Review season trends", enabled: true },
  { label: "Team Management", href: "#", detail: "Team management placeholder", enabled: false },
];

const buildTasks = (directorSummaries: DirectorTournamentSummary[]) =>
  directorSummaries
    .flatMap((summary) => {
      const items: CoachDashboardListItem[] = [];
      if (summary.reviewQueue.length > 0) {
        items.push({
          id: `${summary.tournamentId}-reviews`,
          title: `${summary.reviewQueue.length} review items`,
          detail: summary.tournamentName,
          meta: "Review queue",
          href: `/tournament/${encodeURIComponent(summary.tournamentId || summary.sharedTournamentId)}?tab=Live+Scoring&review=1`,
        });
      }

      if (summary.completion.isReadyToClose) {
        items.push({
          id: `${summary.tournamentId}-finalization`,
          title: "Ready for finalization",
          detail: summary.tournamentName,
          meta: "Tournament closeout",
          href: `/dashboard#director`,
        });
      }

      return items;
    })
    .slice(0, 6);

const buildAlerts = (
  sources: TournamentSource[],
  directorSummaries: DirectorTournamentSummary[],
  missingStatistics: number,
  upcomingEvents: CoachDashboardListItem[]
): CoachDashboardAlert[] => {
  const finalizedById = new Map(sources.map((source) => [source.id || source.sharedTournamentId, source.finalizedAt]));
  const awaitingFinalization = directorSummaries.filter(
    (summary) => summary.completion.isReadyToClose && !finalizedById.get(summary.tournamentId || summary.sharedTournamentId)
  );
  const reviewItems = directorSummaries.reduce((sum, summary) => sum + summary.reviewQueue.length, 0);
  const unsyncedItems = directorSummaries.filter((summary) => summary.readiness.status === "Syncing").length;

  return [
    ...awaitingFinalization.map((summary): CoachDashboardAlert => ({
      id: `${summary.tournamentId}-awaiting-finalization`,
      title: "Tournament awaiting finalization",
      detail: summary.tournamentName,
      severity: "warning",
      href: "/dashboard#director",
    })),
    ...(reviewItems > 0
      ? [{
          id: "review-items",
          title: `${reviewItems} review items`,
          detail: "Score review items need attention.",
          severity: "critical" as const,
          href: "/dashboard#director",
        }]
      : []),
    ...(missingStatistics > 0
      ? [{
          id: "missing-statistics",
          title: `${missingStatistics} missing statistics groups`,
          detail: "Finalized season stats are incomplete.",
          severity: "warning" as const,
          href: "/dashboard/season-statistics",
        }]
      : []),
    ...(upcomingEvents.length > 0
      ? [{
          id: "upcoming-events",
          title: `${upcomingEvents.length} upcoming events`,
          detail: "Tournament dates are on the program calendar.",
          severity: "info" as const,
          href: "/coach-dashboard/calendar",
        }]
      : []),
    ...(unsyncedItems > 0
      ? [{
          id: "unsynced-items",
          title: `${unsyncedItems} syncing tournaments`,
          detail: "Shared tournament state is still catching up.",
          severity: "warning" as const,
          href: "/dashboard#director",
        }]
      : []),
  ].slice(0, 8);
};

export const loadCoachDashboardReadModel = async (
  localTournaments: StoredTournament[] = []
): Promise<CoachDashboardReadModel> => {
  const generatedAt = new Date().toISOString();
  const today = new Date();
  const [aggregates, directorReadModel] = await Promise.all([
    loadSharedTournamentAggregates().catch((error) => {
      console.warn("[CoachDashboardService] Unable to load shared tournament aggregates.", error);
      return [];
    }),
    loadDirectorDashboardReadModel(localTournaments).catch((error) => {
      console.warn("[CoachDashboardService] Unable to load director read model for coach dashboard.", error);
      return { generatedAt, tournaments: [] };
    }),
  ]);
  const seasonStatistics = await loadSeasonStatisticsReadModels({ aggregates }).catch((error) => {
    console.warn("[CoachDashboardService] Unable to load season statistics for coach dashboard.", error);
    return null;
  });
  const sources = mergeTournamentSources(localTournaments, aggregates);
  const practicePlanner = loadPracticePlannerReadModel(today);
  const summariesById = new Map(
    directorReadModel.tournaments.map((summary) => [summary.tournamentId || summary.sharedTournamentId, summary])
  );
  const upcomingTournaments = sources
    .filter((source) => source.date && isSameOrFutureDate(source.date, today) && !source.finalizedAt)
    .sort((left, right) => asTimestamp(left.date) - asTimestamp(right.date))
    .slice(0, 5)
    .map((source) => toTournamentListItem(source, "Upcoming"));
  const activeTournaments = sources
    .filter((source) => isActiveTournament(source, summariesById.get(source.id || source.sharedTournamentId)))
    .slice(0, 5)
    .map((source) => toTournamentListItem(source, "Active"));
  const recentResults = sources
    .filter((source) => source.finalizedAt)
    .sort((left, right) => asTimestamp(right.finalizedAt) - asTimestamp(left.finalizedAt))
    .slice(0, 5)
    .map((source) => toTournamentListItem(source, `Finalized ${formatTimestamp(source.finalizedAt)}`));
  const recentlyEditedTournaments = sources
    .filter((source) => source.updatedAt)
    .sort((left, right) => asTimestamp(right.updatedAt) - asTimestamp(left.updatedAt))
    .slice(0, 5)
    .map((source) => toTournamentListItem(source, `Edited ${formatTimestamp(source.updatedAt)}`));
  const recentlyFinalizedTournaments = recentResults;
  const tasksRequiringAttention = buildTasks(directorReadModel.tournaments);
  const playerKeys = new Set(sources.flatMap((source) => source.players.map((player) => `${player.name}:${player.teamName}`)));
  const teamKeys = new Set(sources.flatMap((source) => source.teams.map((team) => team.name || team.id)));
  const missingStatistics =
    seasonStatistics?.tournamentStatistics.filter(
      (statistics) => statistics.tournamentStatistics.completeness.isComplete === false
    ).length ?? 0;

  return {
    generatedAt,
    today: {
      currentDate: formatDate(today),
      upcomingPractices: practicePlanner.upcomingPractices.slice(0, 3).map((practice) => ({
        id: practice.id,
        title: practice.title,
        detail: practice.detail,
        meta: practice.meta,
        href: "/coach-dashboard/practice-planner",
      })),
      upcomingTournaments,
      tasksRequiringAttention,
      activeTournaments,
    },
    quickActions: buildQuickActions(),
    programSnapshot: {
      metrics: [
        { label: "Players", value: String(playerKeys.size), detail: "Unique rostered players" },
        { label: "Teams", value: String(teamKeys.size), detail: "Teams across events" },
        { label: "Active Tournaments", value: String(activeTournaments.length), detail: "Live or in-progress events" },
        { label: "Season Events", value: String(sources.length), detail: "Tournament events loaded" },
      ],
      recentResults,
    },
    alerts: buildAlerts(sources, directorReadModel.tournaments, missingStatistics, upcomingTournaments),
    recentActivity: {
      recentlyEditedTournaments,
      recentlyFinalizedTournaments,
      recentlyCompletedPractices: practicePlanner.recentPractices.slice(0, 3).map((practice) => ({
        id: practice.id,
        title: practice.title,
        detail: practice.detail,
        meta: practice.meta,
        href: "/coach-dashboard/practice-planner",
      })),
      recentPlayerUpdates: [
        emptyPlaceholder("player-updates-placeholder", "No player updates yet", "Roster changes will appear here in a later phase."),
      ],
    },
  };
};
