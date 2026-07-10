import { loadTournamentStorageEnvelope, type StoredTournament } from "../tournamentStorage";
import type { TournamentStorageEnvelope } from "../tournamentModel";
import { loadPracticePlannerReadModel } from "./practicePlannerService";
import { loadQualifyingManagerReadModel } from "./qualifyingService";
import {
  loadSharedTournamentAggregates,
  type TournamentAggregate,
} from "./tournamentService";

export type CalendarEventType =
  | "Practice"
  | "Qualifying"
  | "Tournament"
  | "Team Meeting"
  | "Lift / Workout"
  | "Travel"
  | "Team Event"
  | "Academic"
  | "Recruiting"
  | "Other";

export type CalendarRelatedModule =
  | "Practice"
  | "Tournament"
  | "Qualifying"
  | "Team"
  | "Academic"
  | "Recruiting"
  | "Other";

export type CalendarEventReadModel = {
  id: string;
  title: string;
  date: string;
  dateLabel: string;
  dayLabel: string;
  time: string;
  type: CalendarEventType;
  location: string;
  notes: string;
  relatedModule: CalendarRelatedModule;
  href: string;
  sortKey: string;
};

export type CalendarDashboardCard = {
  label: "Today's Events" | "This Week" | "Next Tournament" | "Next Practice";
  value: string;
  detail: string;
};

export type CalendarMonthDayReadModel = {
  id: string;
  dayNumber: string;
  dateLabel: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  events: CalendarEventReadModel[];
};

export type CalendarWeekDayReadModel = {
  id: string;
  label: string;
  dateLabel: string;
  isToday: boolean;
  events: CalendarEventReadModel[];
};

export type CalendarAgendaGroupReadModel = {
  id: string;
  label: string;
  events: CalendarEventReadModel[];
};

export type CalendarReadModel = {
  generatedAt: string;
  currentDateLabel: string;
  monthLabel: string;
  weekLabel: string;
  eventTypes: CalendarEventType[];
  dashboardCards: CalendarDashboardCard[];
  monthDays: CalendarMonthDayReadModel[];
  weekDays: CalendarWeekDayReadModel[];
  upcomingEvents: CalendarEventReadModel[];
  agendaGroups: CalendarAgendaGroupReadModel[];
  selectedEvent: CalendarEventReadModel | null;
};

type TournamentSource = {
  id: string;
  sharedTournamentId: string;
  name: string;
  course: string;
  date: string;
  status: string;
  href: string;
  finalizedAt: string | null;
};

const calendarEventTypes: CalendarEventType[] = [
  "Practice",
  "Qualifying",
  "Tournament",
  "Team Meeting",
  "Lift / Workout",
  "Travel",
  "Team Event",
  "Academic",
  "Recruiting",
  "Other",
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

const startOfWeek = (date: Date) => startOfDay(addDays(date, -date.getDay()));

const endOfWeek = (date: Date) => addDays(startOfWeek(date), 6);

const parseDateKey = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

const asString = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);

const formatCurrentDate = (value: Date) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(value);

const formatMonth = (value: Date) =>
  new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(value);

const formatShortDate = (value: Date) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(value);

const formatLongDate = (value: Date) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(value);

const formatWeekday = (value: Date) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: "short",
  }).format(value);

const formatEventDate = (value: string) => {
  const date = parseDateKey(value);
  return date ? formatLongDate(date) : "Date TBD";
};

const formatTime = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return value || "Time TBD";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2000, 0, 1, hours, minutes));
};

const dateTimestamp = (value: string) => parseDateKey(value)?.getTime() ?? 0;

const isBetweenDays = (value: string, start: Date, end: Date) => {
  const timestamp = dateTimestamp(value);
  return timestamp >= startOfDay(start).getTime() && timestamp <= startOfDay(end).getTime();
};

const getFinalizedAt = (settings: unknown) => {
  const finalization = asRecord(asRecord(settings)?.finalization);
  return finalization?.isFinalized ? asString(finalization.finalizedAt) : null;
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
    href: `/tournament/${encodeURIComponent(tournament.id)}`,
    finalizedAt: getFinalizedAt(settings),
  };
};

const getTournamentDateFromEnvelope = (envelope: TournamentStorageEnvelope | null) => {
  const settings = asRecord(envelope?.tournament.settings);
  return asString(settings?.date);
};

const getTournamentSourceFromAggregate = (aggregate: TournamentAggregate): TournamentSource => {
  const id = aggregate.localTournamentId || aggregate.tournamentId || aggregate.sharedTournamentId;
  const date = aggregate.tournament.date || getTournamentDateFromEnvelope(aggregate.envelope);

  return {
    id,
    sharedTournamentId: aggregate.sharedTournamentId,
    name: aggregate.tournament.name || aggregate.envelope?.tournament.name || "Tournament",
    course: aggregate.tournament.course || aggregate.envelope?.tournament.course || "",
    date,
    status: aggregate.tournament.status,
    href: `/tournament/${encodeURIComponent(id || aggregate.sharedTournamentId)}`,
    finalizedAt: getFinalizedAt(aggregate.envelope?.tournament.settings ?? aggregate.tournament.settings),
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
    const existing = sourcesByKey.get(source.id);
    sourcesByKey.set(source.id, {
      ...existing,
      ...source,
      sharedTournamentId: existing?.sharedTournamentId ?? source.sharedTournamentId,
    });
  });

  return [...sourcesByKey.values()];
};

const toCalendarEvent = ({
  id,
  title,
  date,
  startTime,
  endTime,
  type,
  location,
  notes,
  relatedModule,
  href,
}: {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime?: string;
  type: CalendarEventType;
  location: string;
  notes: string;
  relatedModule: CalendarRelatedModule;
  href: string;
}): CalendarEventReadModel => {
  const time = endTime ? `${formatTime(startTime)} - ${formatTime(endTime)}` : formatTime(startTime);

  return {
    id,
    title,
    date,
    dateLabel: formatEventDate(date),
    dayLabel: parseDateKey(date) ? formatWeekday(parseDateKey(date) as Date) : "TBD",
    time,
    type,
    location,
    notes,
    relatedModule,
    href,
    sortKey: `${date}T${startTime || "23:59"}`,
  };
};

const buildTournamentEvents = (sources: TournamentSource[]): CalendarEventReadModel[] =>
  sources
    .filter((source) => Boolean(source.date) && !source.finalizedAt)
    .map((source) =>
      toCalendarEvent({
        id: `tournament-${source.id || source.sharedTournamentId}`,
        title: source.name,
        date: source.date,
        startTime: "08:00",
        type: "Tournament",
        location: source.course || "Course TBD",
        notes: `${source.status || "Upcoming"} tournament from tournament data.`,
        relatedModule: "Tournament",
        href: source.href,
      })
    );

const buildPracticeEvents = (today: Date): CalendarEventReadModel[] => {
  const practicePlanner = loadPracticePlannerReadModel(today);

  return [
    ...practicePlanner.upcomingPractices,
    ...practicePlanner.recentPractices,
  ].map((practice) =>
    toCalendarEvent({
      id: `practice-${practice.id}`,
      title: practice.title,
      date: practice.date,
      startTime: practice.startTime,
      endTime: practice.endTime,
      type: "Practice",
      location: practice.location,
      notes: practice.notes,
      relatedModule: "Practice",
      href: "/coach-dashboard/practice-planner",
    })
  );
};

const buildQualifyingEvents = (today: Date): CalendarEventReadModel[] => {
  const qualifyingManager = loadQualifyingManagerReadModel(today);

  return [
    ...qualifyingManager.upcomingSessions,
    ...qualifyingManager.activeSessions,
    ...qualifyingManager.completedSessions,
  ].map((session) =>
    toCalendarEvent({
      id: `qualifying-${session.id}`,
      title: session.title,
      date: session.date,
      startTime: "14:00",
      type: "Qualifying",
      location: session.course,
      notes: session.notes,
      relatedModule: "Qualifying",
      href: "/coach-dashboard/qualifying-manager",
    })
  );
};

const buildPlaceholderEvents = (today: Date): CalendarEventReadModel[] => [
  toCalendarEvent({
    id: "team-meeting-weekly",
    title: "Weekly Team Meeting",
    date: toDateKey(today),
    startTime: "13:00",
    endTime: "13:45",
    type: "Team Meeting",
    location: "Team Room",
    notes: "Placeholder meeting until team scheduling persistence exists.",
    relatedModule: "Team",
    href: "#",
  }),
  toCalendarEvent({
    id: "lift-mobility",
    title: "Mobility And Strength",
    date: toDateKey(addDays(today, 2)),
    startTime: "07:00",
    endTime: "08:00",
    type: "Lift / Workout",
    location: "Performance Center",
    notes: "Placeholder workout block.",
    relatedModule: "Team",
    href: "#",
  }),
  toCalendarEvent({
    id: "academic-study-hall",
    title: "Study Hall",
    date: toDateKey(addDays(today, 3)),
    startTime: "18:30",
    endTime: "20:00",
    type: "Academic",
    location: "Athletics Academic Center",
    notes: "Placeholder academic support event.",
    relatedModule: "Academic",
    href: "#",
  }),
  toCalendarEvent({
    id: "travel-departure-preview",
    title: "Tournament Travel Window",
    date: toDateKey(addDays(today, 5)),
    startTime: "12:00",
    type: "Travel",
    location: "Athletics Lot",
    notes: "Placeholder travel planning block.",
    relatedModule: "Team",
    href: "#",
  }),
  toCalendarEvent({
    id: "team-event-preview",
    title: "Team Dinner",
    date: toDateKey(addDays(today, 6)),
    startTime: "19:00",
    type: "Team Event",
    location: "Campus Dining",
    notes: "Placeholder team event.",
    relatedModule: "Team",
    href: "#",
  }),
  toCalendarEvent({
    id: "recruiting-placeholder",
    title: "Recruiting Window Placeholder",
    date: toDateKey(addDays(today, 9)),
    startTime: "09:00",
    type: "Recruiting",
    location: "TBD",
    notes: "Placeholder only. No recruiting functionality is active.",
    relatedModule: "Recruiting",
    href: "#",
  }),
  toCalendarEvent({
    id: "other-equipment-check",
    title: "Equipment Check",
    date: toDateKey(addDays(today, 11)),
    startTime: "16:00",
    type: "Other",
    location: "Bag Room",
    notes: "Placeholder operational event.",
    relatedModule: "Other",
    href: "#",
  }),
];

const sortEvents = (events: CalendarEventReadModel[]) =>
  [...events].sort((left, right) => left.sortKey.localeCompare(right.sortKey));

const buildMonthDays = (events: CalendarEventReadModel[], today: Date): CalendarMonthDayReadModel[] => {
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const gridStart = startOfWeek(monthStart);
  const todayKey = toDateKey(today);

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    const dateKey = toDateKey(date);
    return {
      id: dateKey,
      dayNumber: String(date.getDate()),
      dateLabel: formatShortDate(date),
      isCurrentMonth: date.getMonth() === today.getMonth(),
      isToday: dateKey === todayKey,
      events: events.filter((event) => event.date === dateKey),
    };
  });
};

const buildWeekDays = (events: CalendarEventReadModel[], today: Date): CalendarWeekDayReadModel[] => {
  const weekStart = startOfWeek(today);
  const todayKey = toDateKey(today);

  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    const dateKey = toDateKey(date);
    return {
      id: dateKey,
      label: formatWeekday(date),
      dateLabel: formatShortDate(date),
      isToday: dateKey === todayKey,
      events: events.filter((event) => event.date === dateKey),
    };
  });
};

const buildAgendaGroups = (events: CalendarEventReadModel[]): CalendarAgendaGroupReadModel[] => {
  const groupsByDate = new Map<string, CalendarEventReadModel[]>();

  events.forEach((event) => {
    groupsByDate.set(event.date, [...(groupsByDate.get(event.date) ?? []), event]);
  });

  return [...groupsByDate.entries()].map(([date, groupEvents]) => ({
    id: date,
    label: formatEventDate(date),
    events: groupEvents,
  }));
};

const getCardDetail = (event: CalendarEventReadModel | undefined, fallback: string) =>
  event ? `${event.dateLabel} / ${event.time} / ${event.location}` : fallback;

const buildDashboardCards = (
  events: CalendarEventReadModel[],
  today: Date
): CalendarDashboardCard[] => {
  const todayKey = toDateKey(today);
  const weekStart = startOfWeek(today);
  const weekEnd = endOfWeek(today);
  const todayEvents = events.filter((event) => event.date === todayKey);
  const weekEvents = events.filter((event) => isBetweenDays(event.date, weekStart, weekEnd));
  const nextTournament = events.find((event) => event.type === "Tournament" && dateTimestamp(event.date) >= startOfDay(today).getTime());
  const nextPractice = events.find((event) => event.type === "Practice" && dateTimestamp(event.date) >= startOfDay(today).getTime());

  return [
    {
      label: "Today's Events",
      value: String(todayEvents.length),
      detail: todayEvents[0] ? todayEvents[0].title : "No events scheduled today",
    },
    {
      label: "This Week",
      value: String(weekEvents.length),
      detail: `${formatShortDate(weekStart)} - ${formatShortDate(weekEnd)}`,
    },
    {
      label: "Next Tournament",
      value: nextTournament?.title ?? "None",
      detail: getCardDetail(nextTournament, "No upcoming tournaments scheduled"),
    },
    {
      label: "Next Practice",
      value: nextPractice?.title ?? "None",
      detail: getCardDetail(nextPractice, "No upcoming practices scheduled"),
    },
  ];
};

export const loadCalendarReadModel = async (
  localTournaments: StoredTournament[] = [],
  today: Date = new Date()
): Promise<CalendarReadModel> => {
  const generatedAt = new Date().toISOString();
  const normalizedToday = startOfDay(today);
  const aggregates = await loadSharedTournamentAggregates().catch((error) => {
    console.warn("[CalendarService] Unable to load shared tournament aggregates.", error);
    return [];
  });
  const tournamentEvents = buildTournamentEvents(mergeTournamentSources(localTournaments, aggregates));
  const events = sortEvents([
    ...tournamentEvents,
    ...buildPracticeEvents(normalizedToday),
    ...buildQualifyingEvents(normalizedToday),
    ...buildPlaceholderEvents(normalizedToday),
  ]);
  const upcomingEvents = events.filter((event) => dateTimestamp(event.date) >= normalizedToday.getTime()).slice(0, 12);

  return {
    generatedAt,
    currentDateLabel: formatCurrentDate(normalizedToday),
    monthLabel: formatMonth(normalizedToday),
    weekLabel: `${formatShortDate(startOfWeek(normalizedToday))} - ${formatShortDate(endOfWeek(normalizedToday))}`,
    eventTypes: calendarEventTypes,
    dashboardCards: buildDashboardCards(events, normalizedToday),
    monthDays: buildMonthDays(events, normalizedToday),
    weekDays: buildWeekDays(events, normalizedToday),
    upcomingEvents,
    agendaGroups: buildAgendaGroups(upcomingEvents),
    selectedEvent: upcomingEvents[0] ?? null,
  };
};
