import { loadTournamentsFromStorage, type StoredTournament } from "../tournamentStorage";
import { loadCalendarReadModel } from "./calendarService";
import { loadPlayerDevelopmentReadModel } from "./playerDevelopmentService";
import { loadPracticePlannerReadModel } from "./practicePlannerService";
import { loadQualifyingManagerReadModel } from "./qualifyingService";
import { loadSeasonStatisticsReadModels } from "./seasonStatisticsService";
import {
  loadDirectorDashboardReadModel,
  type DirectorTournamentSummary,
} from "./tournamentDirectorDashboardService";

export type TaskCategory =
  | "Tournament Review"
  | "Finalization"
  | "Statistics"
  | "Practice"
  | "Qualifying"
  | "Tournament"
  | "Player Review"
  | "Calendar"
  | "System"
  | "Manual";

export type TaskPriority = "Low" | "Medium" | "High" | "Critical";

export type TaskStatus = "Pending" | "In Progress" | "Completed";

export type TaskRelatedModule =
  | "Tournament"
  | "Statistics"
  | "Practice Planner"
  | "Qualifying Manager"
  | "Player Development"
  | "Calendar"
  | "System"
  | "Manual";

export type TaskCenterTask = {
  id: string;
  title: string;
  description: string;
  category: TaskCategory;
  priority: TaskPriority;
  dueDate: string;
  dueDateLabel: string;
  status: TaskStatus;
  relatedModule: TaskRelatedModule;
  relatedEntity: string;
  actionLink: string;
  ageLabel: string;
};

export type TaskCenterDashboardCard = {
  label: "Tasks Due Today" | "Overdue Tasks" | "High Priority" | "Completed This Week";
  value: string;
  detail: string;
};

export type TaskCenterReadModel = {
  generatedAt: string;
  currentDateLabel: string;
  dashboardCards: TaskCenterDashboardCard[];
  views: {
    today: TaskCenterTask[];
    upcoming: TaskCenterTask[];
    overdue: TaskCenterTask[];
    completed: TaskCenterTask[];
    all: TaskCenterTask[];
  };
};

const oneDayMs = 24 * 60 * 60 * 1000;

const priorityRank: Record<TaskPriority, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

const statusRank: Record<TaskStatus, number> = {
  "In Progress": 0,
  Pending: 1,
  Completed: 2,
};

const padNumber = (value: number) => String(value).padStart(2, "0");

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const addDays = (date: Date, days: number) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;

const parseDateKey = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
};

const formatCurrentDate = (value: Date) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(value);

const formatShortDate = (value: string) => {
  const date = parseDateKey(value);
  if (!date) {
    return "Date TBD";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

const getDaysFromToday = (dateKey: string, today: Date) => {
  const date = parseDateKey(dateKey);
  if (!date) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.round((startOfDay(date).getTime() - startOfDay(today).getTime()) / oneDayMs);
};

const getAgeLabel = (dateKey: string, today: Date, status: TaskStatus) => {
  if (status === "Completed") {
    return "Completed";
  }

  const days = getDaysFromToday(dateKey, today);
  if (!Number.isFinite(days)) {
    return "Unscheduled";
  }

  if (days < 0) {
    return `${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} overdue`;
  }

  if (days === 0) {
    return "Due today";
  }

  return `Due in ${days} ${days === 1 ? "day" : "days"}`;
};

const createTask = (
  task: Omit<TaskCenterTask, "dueDateLabel" | "ageLabel">,
  today: Date
): TaskCenterTask => ({
  ...task,
  dueDateLabel: formatShortDate(task.dueDate),
  ageLabel: getAgeLabel(task.dueDate, today, task.status),
});

const getTournamentKey = (summary: DirectorTournamentSummary) =>
  summary.tournamentId || summary.sharedTournamentId || summary.tournamentName;

const buildTournamentReviewTasks = (summaries: DirectorTournamentSummary[], today: Date) =>
  summaries.flatMap((summary) =>
    summary.reviewQueue.map((item) =>
      createTask(
        {
          id: `review-${item.id}`,
          title: `${summary.tournamentName}: ${item.groupName} needs review`,
          description: item.reasons.join(", "),
          category: "Tournament Review",
          priority: item.severity === "Critical" ? "Critical" : "High",
          dueDate: toDateKey(today),
          status: "Pending",
          relatedModule: "Tournament",
          relatedEntity: summary.tournamentName,
          actionLink: item.reviewHref,
        },
        today
      )
    )
  );

const buildFinalizationTasks = (summaries: DirectorTournamentSummary[], today: Date) =>
  summaries
    .filter((summary) => summary.completion.estimatedState !== "On Pace" || summary.completion.isReadyToClose)
    .map((summary) => {
      const failedItems = summary.completion.checklist.filter((item) => !item.passed);
      const isReady = summary.completion.isReadyToClose;

      return createTask(
        {
          id: `finalization-${getTournamentKey(summary)}`,
          title: isReady
            ? `Finalize ${summary.tournamentName}`
            : `${summary.tournamentName} finalization blockers`,
          description: isReady
            ? "All completion checks are ready for tournament closeout."
            : failedItems.map((item) => item.label).join(", "),
          category: "Finalization",
          priority: isReady ? "High" : "Medium",
          dueDate: toDateKey(today),
          status: isReady ? "Pending" : "In Progress",
          relatedModule: "Tournament",
          relatedEntity: summary.tournamentName,
          actionLink: "/dashboard#director",
        },
        today
      );
    });

const buildMissingStatisticsTasks = async (today: Date) => {
  const seasonStatistics = await loadSeasonStatisticsReadModels().catch((error) => {
    console.warn("[TaskCenterService] Unable to load season statistics tasks.", error);
    return null;
  });

  return (
    seasonStatistics?.tournamentStatistics
      .filter((statistics) => statistics.tournamentStatistics.completeness.isComplete === false)
      .map((statistics) => {
        const tournamentLabel = statistics.tournamentId || statistics.sharedTournamentId || "Tournament";

        return createTask(
          {
            id: `statistics-${statistics.tournamentId || statistics.sharedTournamentId}`,
            title: `${tournamentLabel} has missing statistics`,
            description: `Statistics completeness is ${statistics.tournamentStatistics.completeness.completionPercentage ?? 0} percent.`,
            category: "Statistics",
            priority: "Medium",
            dueDate: toDateKey(today),
            status: "Pending",
            relatedModule: "Statistics",
            relatedEntity: tournamentLabel,
            actionLink: "/dashboard/season-statistics",
          },
          today
        );
      }) ?? []
  );
};

const buildPracticeTasks = (today: Date) =>
  loadPracticePlannerReadModel(today).upcomingPractices.map((practice) =>
    createTask(
      {
        id: `practice-${practice.id}`,
        title: practice.title,
        description: practice.notes || practice.detail,
        category: "Practice",
        priority: getDaysFromToday(practice.date, today) <= 1 ? "Medium" : "Low",
        dueDate: practice.date,
        status: "Pending",
        relatedModule: "Practice Planner",
        relatedEntity: practice.location,
        actionLink: "/coach-dashboard/practice-planner",
      },
      today
    )
  );

const buildQualifyingTasks = (today: Date) => {
  const qualifying = loadQualifyingManagerReadModel(today);
  return [...qualifying.activeSessions, ...qualifying.upcomingSessions].map((session) =>
    createTask(
      {
        id: `qualifying-${session.id}`,
        title: session.status === "Active" ? `${session.title} is active` : session.title,
        description: `${session.detail}. ${session.notes}`,
        category: "Qualifying",
        priority: session.status === "Active" ? "High" : "Medium",
        dueDate: session.date,
        status: session.status === "Active" ? "In Progress" : "Pending",
        relatedModule: "Qualifying Manager",
        relatedEntity: session.course,
        actionLink: "/coach-dashboard/qualifying-manager",
      },
      today
    )
  );
};

const buildPlayerReviewTasks = (today: Date) =>
  loadPlayerDevelopmentReadModel(today).reviewSchedule
    .filter((review) => review.meta === "Overdue" || review.meta === "This Week")
    .map((review) => {
      const dueDateMatch = review.detail.match(/Next review ([A-Za-z]{3} \d{1,2}, \d{4})/);
      const parsedDueDate = dueDateMatch ? new Date(dueDateMatch[1]) : null;
      const dueDate = parsedDueDate && !Number.isNaN(parsedDueDate.getTime()) ? toDateKey(parsedDueDate) : toDateKey(today);

      return createTask(
        {
          id: `player-review-${review.id}`,
          title: `${review.title} review due`,
          description: review.detail,
          category: "Player Review",
          priority: review.meta === "Overdue" ? "High" : "Medium",
          dueDate,
          status: "Pending",
          relatedModule: "Player Development",
          relatedEntity: review.title,
          actionLink: "/coach-dashboard/player-development",
        },
        today
      );
    });

const buildCalendarTasks = async (localTournaments: StoredTournament[], today: Date) => {
  const calendar = await loadCalendarReadModel(localTournaments, today).catch((error) => {
    console.warn("[TaskCenterService] Unable to load calendar tasks.", error);
    return null;
  });

  if (!calendar) {
    return [];
  }

  const tournamentTasks = calendar.upcomingEvents
    .filter((event) => event.type === "Tournament")
    .map((event) =>
      createTask(
        {
          id: `calendar-tournament-${event.id}`,
          title: `Upcoming tournament: ${event.title}`,
          description: `${event.dateLabel} / ${event.time} / ${event.location}`,
          category: "Tournament",
          priority: getDaysFromToday(event.date, today) <= 3 ? "High" : "Medium",
          dueDate: event.date,
          status: "Pending",
          relatedModule: "Tournament",
          relatedEntity: event.title,
          actionLink: event.href,
        },
        today
      )
    );

  const attentionTasks = calendar.upcomingEvents
    .filter((event) => event.href === "#" || ["Travel", "Recruiting", "Other"].includes(event.type))
    .map((event) =>
      createTask(
        {
          id: `calendar-attention-${event.id}`,
          title: `${event.title} needs attention`,
          description: event.notes || `${event.dateLabel} / ${event.time} / ${event.location}`,
          category: "Calendar",
          priority: getDaysFromToday(event.date, today) <= 2 ? "Medium" : "Low",
          dueDate: event.date,
          status: "Pending",
          relatedModule: "Calendar",
          relatedEntity: event.title,
          actionLink: event.href,
        },
        today
      )
    );

  return [...tournamentTasks, ...attentionTasks];
};

const buildSystemReminderTasks = (today: Date) => [
  createTask(
    {
      id: "system-review-shared-sync",
      title: "Review shared tournament sync health",
      description: "Confirm shared tournament snapshots are current before weekend competition.",
      category: "System",
      priority: "Medium",
      dueDate: toDateKey(addDays(today, 1)),
      status: "Pending",
      relatedModule: "System",
      relatedEntity: "Shared sync",
      actionLink: "/dashboard#director",
    },
    today
  ),
  createTask(
    {
      id: "system-weekly-program-review",
      title: "Weekly program review",
      description: "Read-only reminder for reviewing practices, qualifying, player reviews, and events.",
      category: "System",
      priority: "Low",
      dueDate: toDateKey(addDays(today, 4)),
      status: "Pending",
      relatedModule: "System",
      relatedEntity: "Coach portal",
      actionLink: "/coach-dashboard",
    },
    today
  ),
];

const buildManualPlaceholderTasks = (today: Date) => [
  createTask(
    {
      id: "manual-placeholder-equipment",
      title: "Placeholder manual task: equipment checklist",
      description: "Manual tasks will become editable in a later phase.",
      category: "Manual",
      priority: "Low",
      dueDate: toDateKey(addDays(today, 2)),
      status: "Pending",
      relatedModule: "Manual",
      relatedEntity: "Equipment",
      actionLink: "#",
    },
    today
  ),
];

const sortTasks = (tasks: TaskCenterTask[]) =>
  [...tasks].sort((left, right) => {
    const statusComparison = statusRank[left.status] - statusRank[right.status];
    if (statusComparison !== 0) {
      return statusComparison;
    }

    const dateComparison = left.dueDate.localeCompare(right.dueDate);
    if (dateComparison !== 0) {
      return dateComparison;
    }

    const priorityComparison = priorityRank[left.priority] - priorityRank[right.priority];
    if (priorityComparison !== 0) {
      return priorityComparison;
    }

    return left.title.localeCompare(right.title);
  });

const dedupeTasks = (tasks: TaskCenterTask[]) => {
  const tasksById = new Map<string, TaskCenterTask>();
  tasks.forEach((task) => {
    tasksById.set(task.id, task);
  });

  return [...tasksById.values()];
};

const buildDashboardCards = (tasks: TaskCenterTask[], today: Date): TaskCenterDashboardCard[] => {
  const todayKey = toDateKey(today);
  const weekAgo = addDays(today, -6);
  const activeTasks = tasks.filter((task) => task.status !== "Completed");
  const dueToday = activeTasks.filter((task) => task.dueDate === todayKey);
  const overdue = activeTasks.filter((task) => getDaysFromToday(task.dueDate, today) < 0);
  const highPriority = activeTasks.filter((task) => task.priority === "High" || task.priority === "Critical");
  const completedThisWeek = tasks.filter((task) => {
    const dueDate = parseDateKey(task.dueDate);
    return (
      task.status === "Completed" &&
      dueDate !== null &&
      dueDate.getTime() >= startOfDay(weekAgo).getTime() &&
      dueDate.getTime() <= startOfDay(today).getTime()
    );
  });

  return [
    {
      label: "Tasks Due Today",
      value: String(dueToday.length),
      detail: dueToday[0]?.title ?? "No tasks due today",
    },
    {
      label: "Overdue Tasks",
      value: String(overdue.length),
      detail: overdue[0]?.title ?? "No overdue tasks",
    },
    {
      label: "High Priority",
      value: String(highPriority.length),
      detail: highPriority[0]?.title ?? "No high priority tasks",
    },
    {
      label: "Completed This Week",
      value: String(completedThisWeek.length),
      detail: completedThisWeek[0]?.title ?? "No completed tasks this week",
    },
  ];
};

export const buildTaskCenterViews = (tasks: TaskCenterTask[], today: Date): TaskCenterReadModel["views"] => {
  const todayKey = toDateKey(today);
  const activeTasks = tasks.filter((task) => task.status !== "Completed");

  return {
    today: sortTasks(activeTasks.filter((task) => task.dueDate === todayKey)),
    upcoming: sortTasks(activeTasks.filter((task) => getDaysFromToday(task.dueDate, today) > 0)),
    overdue: sortTasks(activeTasks.filter((task) => getDaysFromToday(task.dueDate, today) < 0)),
    completed: sortTasks(tasks.filter((task) => task.status === "Completed")),
    all: sortTasks(tasks),
  };
};

export const loadTaskCenterReadModel = async (
  localTournaments: StoredTournament[] = loadTournamentsFromStorage(),
  today: Date = new Date()
): Promise<TaskCenterReadModel> => {
  const generatedAt = new Date().toISOString();
  const normalizedToday = startOfDay(today);
  const directorReadModel = await loadDirectorDashboardReadModel(localTournaments).catch((error) => {
    console.warn("[TaskCenterService] Unable to load director dashboard tasks.", error);
    return { generatedAt, tournaments: [] };
  });
  const [missingStatisticsTasks, calendarTasks] = await Promise.all([
    buildMissingStatisticsTasks(normalizedToday),
    buildCalendarTasks(localTournaments, normalizedToday),
  ]);
  const tasks = dedupeTasks([
    ...buildTournamentReviewTasks(directorReadModel.tournaments, normalizedToday),
    ...buildFinalizationTasks(directorReadModel.tournaments, normalizedToday),
    ...missingStatisticsTasks,
    ...buildPracticeTasks(normalizedToday),
    ...buildQualifyingTasks(normalizedToday),
    ...calendarTasks,
    ...buildPlayerReviewTasks(normalizedToday),
    ...buildSystemReminderTasks(normalizedToday),
    ...buildManualPlaceholderTasks(normalizedToday),
  ]);

  return {
    generatedAt,
    currentDateLabel: formatCurrentDate(normalizedToday),
    dashboardCards: buildDashboardCards(tasks, normalizedToday),
    views: buildTaskCenterViews(tasks, normalizedToday),
  };
};
