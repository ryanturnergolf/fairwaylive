export type QualifyingFormat = "Stroke Play" | "Match Play" | "Skills Challenge" | "Simulator";

export type QualifyingStatus = "Scheduled" | "Active" | "Complete";

export type QualifyingParticipant = {
  id: string;
  name: string;
  teamName: string;
  classYear: string;
};

export type QualifyingRound = {
  id: string;
  label: string;
  date: string;
  course: string;
  status: QualifyingStatus;
};

export type QualifyingSession = {
  id: string;
  name: string;
  date: string;
  course: string;
  format: QualifyingFormat;
  numberOfRounds: number;
  participants: QualifyingParticipant[];
  status: QualifyingStatus;
  notes: string;
  deadline: string;
  rounds: QualifyingRound[];
};

export type QualifyingDashboardCard = {
  label: string;
  value: string;
  detail: string;
};

export type QualifyingSessionListItem = {
  id: string;
  title: string;
  date: string;
  course: string;
  format: QualifyingFormat;
  detail: string;
  meta: string;
  status: QualifyingStatus;
  notes: string;
  participantCount: number;
  roundCount: number;
};

export type QualifyingSessionDetailReadModel = {
  id: string;
  name: string;
  status: QualifyingStatus;
  participants: QualifyingParticipant[];
  rounds: QualifyingRound[];
  currentLeaderboardPlaceholder: string;
  notes: string;
};

export type QualifyingQuickCreateReadModel = {
  availableFormats: QualifyingFormat[];
  defaultSession: {
    name: string;
    date: string;
    course: string;
    format: QualifyingFormat;
    numberOfRounds: number;
    status: QualifyingStatus;
    notes: string;
  };
  statusLabel: string;
};

export type QualifyingManagerReadModel = {
  generatedAt: string;
  currentDateLabel: string;
  dashboardCards: QualifyingDashboardCard[];
  upcomingSessions: QualifyingSessionListItem[];
  activeSessions: QualifyingSessionListItem[];
  completedSessions: QualifyingSessionListItem[];
  seasonStandingsPlaceholder: string;
  quickCreate: QualifyingQuickCreateReadModel;
  selectedSession: QualifyingSessionDetailReadModel | null;
};

const qualifyingFormats: QualifyingFormat[] = [
  "Stroke Play",
  "Match Play",
  "Skills Challenge",
  "Simulator",
];

const padNumber = (value: number) => String(value).padStart(2, "0");

const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;

const addDays = (date: Date, days: number) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const parseDateKey = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
};

const formatDateLabel = (value: Date) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(value);

const formatShortDateLabel = (value: Date) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);

const formatSessionDate = (value: string) => {
  const date = parseDateKey(value);
  return date ? formatShortDateLabel(date) : "Date TBD";
};

const getFixtureParticipants = (): QualifyingParticipant[] => [
  { id: "player-avery", name: "Avery Brooks", teamName: "Varsity", classYear: "Senior" },
  { id: "player-cam", name: "Cam Riley", teamName: "Varsity", classYear: "Junior" },
  { id: "player-jordan", name: "Jordan Lee", teamName: "JV", classYear: "Sophomore" },
  { id: "player-morgan", name: "Morgan Chen", teamName: "Varsity", classYear: "Senior" },
  { id: "player-taylor", name: "Taylor Quinn", teamName: "JV", classYear: "Freshman" },
  { id: "player-drew", name: "Drew Patel", teamName: "Varsity", classYear: "Junior" },
];

const buildRounds = (
  sessionId: string,
  startDate: Date,
  numberOfRounds: number,
  course: string,
  status: QualifyingStatus
): QualifyingRound[] =>
  Array.from({ length: numberOfRounds }, (_, index) => ({
    id: `${sessionId}-round-${index + 1}`,
    label: `Round ${index + 1}`,
    date: toDateKey(addDays(startDate, index)),
    course,
    status,
  }));

const getFixtureSessions = (today: Date): QualifyingSession[] => {
  const participants = getFixtureParticipants();
  const normalizedToday = startOfDay(today);
  const activeStart = addDays(normalizedToday, -1);
  const strokeStart = addDays(normalizedToday, 3);
  const matchStart = addDays(normalizedToday, 10);
  const completeStart = addDays(normalizedToday, -16);

  return [
    {
      id: "qualifying-summer-stroke",
      name: "Summer Stroke Play Qualifier",
      date: toDateKey(strokeStart),
      course: "Fairway Live Golf Club",
      format: "Stroke Play",
      numberOfRounds: 2,
      participants: participants.slice(0, 6),
      status: "Scheduled",
      notes: "Two-round aggregate preview for future qualifying setup.",
      deadline: toDateKey(addDays(strokeStart, -1)),
      rounds: buildRounds("qualifying-summer-stroke", strokeStart, 2, "Fairway Live Golf Club", "Scheduled"),
    },
    {
      id: "qualifying-july-match",
      name: "July Match Play Ladder",
      date: toDateKey(matchStart),
      course: "North Ridge Course",
      format: "Match Play",
      numberOfRounds: 3,
      participants: participants.slice(0, 4),
      status: "Scheduled",
      notes: "Bracket and seeding logic will be added in a later phase.",
      deadline: toDateKey(addDays(matchStart, -2)),
      rounds: buildRounds("qualifying-july-match", matchStart, 3, "North Ridge Course", "Scheduled"),
    },
    {
      id: "qualifying-short-game",
      name: "Short Game Skills Challenge",
      date: toDateKey(activeStart),
      course: "Practice Complex",
      format: "Skills Challenge",
      numberOfRounds: 1,
      participants: participants.slice(1, 6),
      status: "Active",
      notes: "Station scoring is intentionally unavailable in this read-only foundation.",
      deadline: toDateKey(activeStart),
      rounds: buildRounds("qualifying-short-game", activeStart, 1, "Practice Complex", "Active"),
    },
    {
      id: "qualifying-spring-simulator",
      name: "Spring Simulator Qualifier",
      date: toDateKey(completeStart),
      course: "Indoor Performance Center",
      format: "Simulator",
      numberOfRounds: 2,
      participants: participants.slice(0, 5),
      status: "Complete",
      notes: "Completed session retained as a read-only history example.",
      deadline: toDateKey(addDays(completeStart, -1)),
      rounds: buildRounds("qualifying-spring-simulator", completeStart, 2, "Indoor Performance Center", "Complete"),
    },
  ];
};

const sortSessionsByDate = (left: QualifyingSession, right: QualifyingSession) =>
  left.date.localeCompare(right.date);

const toListItem = (session: QualifyingSession): QualifyingSessionListItem => ({
  id: session.id,
  title: session.name,
  date: session.date,
  course: session.course,
  format: session.format,
  detail: `${formatSessionDate(session.date)} - ${session.course} - ${session.format}`,
  meta: `${session.numberOfRounds} ${session.numberOfRounds === 1 ? "round" : "rounds"}`,
  status: session.status,
  notes: session.notes,
  participantCount: session.participants.length,
  roundCount: session.rounds.length,
});

const toDetailReadModel = (session: QualifyingSession): QualifyingSessionDetailReadModel => ({
  id: session.id,
  name: session.name,
  status: session.status,
  participants: session.participants,
  rounds: session.rounds,
  currentLeaderboardPlaceholder: "Leaderboard will appear after score entry and ranking calculations are introduced.",
  notes: session.notes,
});

const toSelectedSessionReadModel = (session: QualifyingSession | null) =>
  session ? toDetailReadModel(session) : null;

const countUniqueParticipants = (sessions: QualifyingSession[]) =>
  new Set(sessions.flatMap((session) => session.participants.map((participant) => participant.id))).size;

export const loadQualifyingManagerReadModel = (today: Date = new Date()): QualifyingManagerReadModel => {
  const generatedAt = new Date().toISOString();
  const normalizedToday = startOfDay(today);
  const sessions = getFixtureSessions(normalizedToday);
  const upcoming = sessions
    .filter((session) => session.status === "Scheduled")
    .sort(sortSessionsByDate);
  const active = sessions
    .filter((session) => session.status === "Active")
    .sort(sortSessionsByDate);
  const completed = sessions
    .filter((session) => session.status === "Complete")
    .sort((left, right) => sortSessionsByDate(right, left));
  const nextSession = upcoming[0] ?? null;
  const nextDeadline = upcoming
    .map((session) => session.deadline)
    .sort((left, right) => left.localeCompare(right))[0];

  return {
    generatedAt,
    currentDateLabel: formatDateLabel(normalizedToday),
    dashboardCards: [
      {
        label: "Next Qualifying Session",
        value: nextSession ? nextSession.name : "None",
        detail: nextSession ? toListItem(nextSession).detail : "No scheduled sessions",
      },
      {
        label: "Active Qualifying",
        value: String(active.length),
        detail: active[0] ? active[0].name : "No active qualifying sessions",
      },
      {
        label: "Players Participating",
        value: String(countUniqueParticipants(sessions.filter((session) => session.status !== "Complete"))),
        detail: "Unique players in scheduled or active qualifying",
      },
      {
        label: "Upcoming Deadlines",
        value: String(upcoming.length),
        detail: nextDeadline ? `Next deadline ${formatSessionDate(nextDeadline)}` : "No registration deadlines",
      },
    ],
    upcomingSessions: upcoming.map(toListItem),
    activeSessions: active.map(toListItem),
    completedSessions: completed.map(toListItem),
    seasonStandingsPlaceholder: "Season standings are reserved for a later phase. No ranking calculations run yet.",
    quickCreate: {
      availableFormats: qualifyingFormats,
      defaultSession: {
        name: "Untitled Qualifying Session",
        date: toDateKey(addDays(normalizedToday, 7)),
        course: "Home Course",
        format: "Stroke Play",
        numberOfRounds: 1,
        status: "Scheduled",
        notes: "Read-only preview. Persistence will be added in a later phase.",
      },
      statusLabel: "Read-only preview",
    },
    selectedSession: toSelectedSessionReadModel(active[0] ?? upcoming[0] ?? completed[0] ?? null),
  };
};
