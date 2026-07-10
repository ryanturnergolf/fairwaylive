export type PracticeType =
  | "Team"
  | "Individual"
  | "Qualifying"
  | "Short Game"
  | "Putting"
  | "On-Course"
  | "Simulator";

export type Practice = {
  id: string;
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  practiceType: PracticeType;
  notes: string;
};

export type PracticePlannerCard = {
  label: string;
  value: string;
  detail: string;
};

export type PracticePlannerListItem = {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  detail: string;
  meta: string;
  href: string;
  notes: string;
};

export type PracticePlannerCalendarDay = {
  id: string;
  label: string;
  dateLabel: string;
  practices: PracticePlannerListItem[];
};

export type PracticeTemplatePlaceholder = {
  id: string;
  title: string;
  detail: string;
};

export type PracticeQuickCreateReadModel = {
  availableTypes: PracticeType[];
  defaultPractice: Practice;
  statusLabel: string;
};

export type PracticePlannerReadModel = {
  generatedAt: string;
  currentDateLabel: string;
  dashboardCards: PracticePlannerCard[];
  upcomingPractices: PracticePlannerListItem[];
  weeklyCalendar: PracticePlannerCalendarDay[];
  practiceTemplates: PracticeTemplatePlaceholder[];
  recentPractices: PracticePlannerListItem[];
  quickCreate: PracticeQuickCreateReadModel;
};

const practiceTypes: PracticeType[] = [
  "Team",
  "Individual",
  "Qualifying",
  "Short Game",
  "Putting",
  "On-Course",
  "Simulator",
];

const oneDayMs = 24 * 60 * 60 * 1000;

const padNumber = (value: number) => String(value).padStart(2, "0");

const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;

const addDays = (date: Date, days: number) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const startOfWeek = (date: Date) => {
  const day = date.getDay();
  return startOfDay(addDays(date, -day));
};

const parsePracticeDate = (value: string) => {
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
  }).format(value);

const formatWeekdayLabel = (value: Date) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: "short",
  }).format(value);

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

const getPracticeDurationHours = (practice: Practice) => {
  const [startHours, startMinutes] = practice.startTime.split(":").map(Number);
  const [endHours, endMinutes] = practice.endTime.split(":").map(Number);

  if (
    !Number.isFinite(startHours) ||
    !Number.isFinite(startMinutes) ||
    !Number.isFinite(endHours) ||
    !Number.isFinite(endMinutes)
  ) {
    return 0;
  }

  const startTotal = startHours * 60 + startMinutes;
  const endTotal = endHours * 60 + endMinutes;
  return Math.max(0, endTotal - startTotal) / 60;
};

const getFixturePractices = (today: Date): Practice[] => [
  {
    id: "practice-team-prep",
    name: "Team Course Management",
    date: toDateKey(addDays(today, 1)),
    startTime: "15:30",
    endTime: "17:30",
    location: "Home Course - Back Nine",
    practiceType: "Team",
    notes: "Shot selection, target discipline, and closing-hole routines.",
  },
  {
    id: "practice-putting-block",
    name: "Putting Start Line Lab",
    date: toDateKey(addDays(today, 2)),
    startTime: "08:00",
    endTime: "09:15",
    location: "Practice Green",
    practiceType: "Putting",
    notes: "Gate drills and speed ladder work before afternoon lifts.",
  },
  {
    id: "practice-qualifying-nine",
    name: "Nine-Hole Qualifying",
    date: toDateKey(addDays(today, 4)),
    startTime: "14:00",
    endTime: "17:00",
    location: "Home Course - Front Nine",
    practiceType: "Qualifying",
    notes: "Read-only placeholder for a future qualifying workflow.",
  },
  {
    id: "practice-simulator-gapping",
    name: "Simulator Wedge Gapping",
    date: toDateKey(addDays(today, 7)),
    startTime: "10:00",
    endTime: "11:30",
    location: "Indoor Performance Center",
    practiceType: "Simulator",
    notes: "Carry windows for 40, 60, 80, and 100 yards.",
  },
  {
    id: "practice-short-game-review",
    name: "Short Game Scoring Review",
    date: toDateKey(addDays(today, -2)),
    startTime: "16:00",
    endTime: "17:15",
    location: "Short Game Area",
    practiceType: "Short Game",
    notes: "Up-and-down stations from rough, bunker, and tight lies.",
  },
  {
    id: "practice-individual-checkin",
    name: "Individual Check-ins",
    date: toDateKey(addDays(today, -5)),
    startTime: "09:00",
    endTime: "10:30",
    location: "Team Room",
    practiceType: "Individual",
    notes: "Read-only coaching notes placeholder.",
  },
];

const toListItem = (practice: Practice): PracticePlannerListItem => {
  const practiceDate = parsePracticeDate(practice.date);
  const dateLabel = practiceDate ? formatShortDateLabel(practiceDate) : "Date TBD";
  const timeLabel = `${formatTime(practice.startTime)} - ${formatTime(practice.endTime)}`;

  return {
    id: practice.id,
    title: practice.name,
    date: practice.date,
    startTime: practice.startTime,
    endTime: practice.endTime,
    location: practice.location,
    detail: `${dateLabel} at ${timeLabel} - ${practice.location}`,
    meta: practice.practiceType,
    href: "#",
    notes: practice.notes,
  };
};

const sortPracticesByStart = (left: Practice, right: Practice) =>
  `${left.date}T${left.startTime}`.localeCompare(`${right.date}T${right.startTime}`);

export const loadPracticePlannerReadModel = (today: Date = new Date()): PracticePlannerReadModel => {
  const generatedAt = new Date().toISOString();
  const normalizedToday = startOfDay(today);
  const weekStart = startOfWeek(normalizedToday);
  const weekEnd = addDays(weekStart, 6);
  const practices = getFixturePractices(normalizedToday);
  const upcoming = practices
    .filter((practice) => {
      const practiceDate = parsePracticeDate(practice.date);
      return practiceDate ? startOfDay(practiceDate).getTime() >= normalizedToday.getTime() : false;
    })
    .sort(sortPracticesByStart);
  const recent = practices
    .filter((practice) => {
      const practiceDate = parsePracticeDate(practice.date);
      return practiceDate ? startOfDay(practiceDate).getTime() < normalizedToday.getTime() : false;
    })
    .sort((left, right) => sortPracticesByStart(right, left));
  const practicesThisWeek = upcoming.filter((practice) => {
    const practiceDate = parsePracticeDate(practice.date);
    if (!practiceDate) {
      return false;
    }

    const timestamp = startOfDay(practiceDate).getTime();
    return timestamp >= weekStart.getTime() && timestamp <= weekEnd.getTime();
  });
  const qualifyingPractices = upcoming.filter((practice) => practice.practiceType === "Qualifying");
  const weekHours = practicesThisWeek.reduce((sum, practice) => sum + getPracticeDurationHours(practice), 0);
  const nextPractice = upcoming[0] ?? null;
  const defaultDate = toDateKey(addDays(normalizedToday, 1));

  return {
    generatedAt,
    currentDateLabel: formatDateLabel(normalizedToday),
    dashboardCards: [
      {
        label: "Next Practice",
        value: nextPractice ? nextPractice.name : "None",
        detail: nextPractice ? toListItem(nextPractice).detail : "No upcoming practices scheduled",
      },
      {
        label: "Practices This Week",
        value: String(practicesThisWeek.length),
        detail: `${formatShortDateLabel(weekStart)} - ${formatShortDateLabel(weekEnd)}`,
      },
      {
        label: "Upcoming Qualifying",
        value: String(qualifyingPractices.length),
        detail: qualifyingPractices[0] ? toListItem(qualifyingPractices[0]).detail : "No qualifying sessions scheduled",
      },
      {
        label: "Practice Hours Scheduled",
        value: `${weekHours.toFixed(weekHours % 1 === 0 ? 0 : 1)}h`,
        detail: "Total scheduled practice time this week",
      },
    ],
    upcomingPractices: upcoming.slice(0, 6).map(toListItem),
    weeklyCalendar: Array.from({ length: 7 }, (_, index) => {
      const date = addDays(weekStart, index);
      const dateKey = toDateKey(date);
      return {
        id: dateKey,
        label: formatWeekdayLabel(date),
        dateLabel: formatShortDateLabel(date),
        practices: practices
          .filter((practice) => practice.date === dateKey)
          .sort(sortPracticesByStart)
          .map(toListItem),
      };
    }),
    practiceTemplates: [
      {
        id: "template-team",
        title: "Team Practice Template",
        detail: "Template management will be added in a later phase.",
      },
      {
        id: "template-qualifying",
        title: "Qualifying Template",
        detail: "Qualifying setup remains a placeholder.",
      },
    ],
    recentPractices: recent.slice(0, 5).map(toListItem),
    quickCreate: {
      availableTypes: practiceTypes,
      defaultPractice: {
        id: "quick-create-preview",
        name: "Untitled Practice",
        date: defaultDate,
        startTime: "15:30",
        endTime: "17:00",
        location: "Practice Facility",
        practiceType: "Team",
        notes: "Read-only preview. Persistence will be added in a later phase.",
      },
      statusLabel: "Read-only preview",
    },
  };
};
