export type DevelopmentSkillKey =
  | "driving"
  | "approach"
  | "shortGame"
  | "putting"
  | "courseManagement"
  | "mentalGame";

export type DevelopmentSkillRating = {
  key: DevelopmentSkillKey;
  label: string;
  value: number;
  trend: "Improving" | "Steady" | "Needs Focus";
  note: string;
};

export type DevelopmentGoalStatus = "Active" | "Completed" | "Upcoming";

export type DevelopmentGoal = {
  id: string;
  title: string;
  status: DevelopmentGoalStatus;
  dueDate: string;
  completedDate: string | null;
  focusArea: string;
  notes: string;
};

export type CoachNote = {
  id: string;
  date: string;
  author: string;
  note: string;
};

export type DevelopmentPlayer = {
  id: string;
  name: string;
  teamName: string;
  classYear: string;
};

export type DevelopmentPlan = {
  id: string;
  player: DevelopmentPlayer;
  summary: string;
  strengths: string[];
  improvementAreas: string[];
  goals: DevelopmentGoal[];
  skillRatings: DevelopmentSkillRating[];
  coachNotes: CoachNote[];
  lastReviewDate: string;
  nextReviewDate: string;
  planStatus: "Active" | "Draft";
};

export type PlayerDevelopmentCard = {
  label: string;
  value: string;
  detail: string;
};

export type PlayerDevelopmentListItem = {
  id: string;
  title: string;
  detail: string;
  meta: string;
  status?: string;
};

export type SkillRatingGroupReadModel = {
  key: DevelopmentSkillKey;
  label: string;
  average: string;
  topPlayer: string;
  needsFocusCount: number;
  ratings: Array<{
    playerName: string;
    value: number;
    trend: DevelopmentSkillRating["trend"];
    note: string;
  }>;
};

export type PlayerDevelopmentDetailReadModel = {
  id: string;
  playerName: string;
  playerMeta: string;
  planStatus: string;
  developmentSummary: string;
  strengths: string[];
  improvementAreas: string[];
  currentGoals: PlayerDevelopmentListItem[];
  skillRatings: DevelopmentSkillRating[];
  progressTimelinePlaceholder: string;
  recentNotes: PlayerDevelopmentListItem[];
  upcomingReview: PlayerDevelopmentListItem | null;
};

export type PlayerDevelopmentReadModel = {
  generatedAt: string;
  currentDateLabel: string;
  dashboardCards: PlayerDevelopmentCard[];
  developmentPlans: PlayerDevelopmentListItem[];
  goals: PlayerDevelopmentListItem[];
  skillRatings: SkillRatingGroupReadModel[];
  reviewSchedule: PlayerDevelopmentListItem[];
  recentCoachNotes: PlayerDevelopmentListItem[];
  selectedPlayer: PlayerDevelopmentDetailReadModel | null;
};

const skillLabels: Record<DevelopmentSkillKey, string> = {
  driving: "Driving",
  approach: "Approach",
  shortGame: "Short Game",
  putting: "Putting",
  courseManagement: "Course Management",
  mentalGame: "Mental Game",
};

const skillKeys = Object.keys(skillLabels) as DevelopmentSkillKey[];

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

const formatShortDateLabel = (value: string) => {
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

const getDaysUntil = (dateKey: string, today: Date) => {
  const date = parseDateKey(dateKey);
  if (!date) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.round((startOfDay(date).getTime() - startOfDay(today).getTime()) / (24 * 60 * 60 * 1000));
};

const getFixturePlans = (today: Date): DevelopmentPlan[] => {
  const players: DevelopmentPlayer[] = [
    { id: "player-avery", name: "Avery Brooks", teamName: "Varsity", classYear: "Senior" },
    { id: "player-cam", name: "Cam Riley", teamName: "Varsity", classYear: "Junior" },
    { id: "player-jordan", name: "Jordan Lee", teamName: "JV", classYear: "Sophomore" },
    { id: "player-morgan", name: "Morgan Chen", teamName: "Varsity", classYear: "Senior" },
  ];

  return [
    {
      id: "development-avery",
      player: players[0],
      summary: "Building a tournament-ready scoring profile around accurate driving and firmer putting routines.",
      strengths: ["Driving accuracy", "Pre-shot discipline", "Par-5 strategy"],
      improvementAreas: ["Inside-six-foot conversion", "Recovery wedge distance control"],
      goals: [
        {
          id: "goal-avery-putting",
          title: "Complete four start-line putting blocks",
          status: "Active",
          dueDate: toDateKey(addDays(today, 14)),
          completedDate: null,
          focusArea: "Putting",
          notes: "Track gate drill completion and confidence after each block.",
        },
        {
          id: "goal-avery-driving",
          title: "Map driver targets for home-course qualifying",
          status: "Completed",
          dueDate: toDateKey(addDays(today, -3)),
          completedDate: toDateKey(addDays(today, -5)),
          focusArea: "Course Management",
          notes: "Target map reviewed with coaching staff.",
        },
      ],
      skillRatings: [
        { key: "driving", label: "Driving", value: 8, trend: "Steady", note: "Reliable fairway finder under pressure." },
        { key: "approach", label: "Approach", value: 7, trend: "Improving", note: "Better distance windows from 140-165." },
        { key: "shortGame", label: "Short Game", value: 6, trend: "Needs Focus", note: "Needs cleaner low-point control." },
        { key: "putting", label: "Putting", value: 6, trend: "Improving", note: "Start line is improving; speed work next." },
        { key: "courseManagement", label: "Course Management", value: 8, trend: "Steady", note: "Chooses targets with clear intent." },
        { key: "mentalGame", label: "Mental Game", value: 7, trend: "Steady", note: "Reset routine is dependable." },
      ],
      coachNotes: [
        {
          id: "note-avery-1",
          date: toDateKey(addDays(today, -2)),
          author: "Coach",
          note: "Good ownership of putting process. Keep the routine simple during qualifying pressure.",
        },
        {
          id: "note-avery-2",
          date: toDateKey(addDays(today, -12)),
          author: "Coach",
          note: "Strong practice energy after rough opening nine. Recovery response is trending well.",
        },
      ],
      lastReviewDate: toDateKey(addDays(today, -18)),
      nextReviewDate: toDateKey(addDays(today, 6)),
      planStatus: "Active",
    },
    {
      id: "development-cam",
      player: players[1],
      summary: "Prioritizing approach proximity and patient decision-making before the next travel event.",
      strengths: ["Ball speed", "Competitive confidence", "Bunker play"],
      improvementAreas: ["Approach dispersion", "Post-mistake pacing"],
      goals: [
        {
          id: "goal-cam-approach",
          title: "Reduce left miss in approach combine",
          status: "Active",
          dueDate: toDateKey(addDays(today, 9)),
          completedDate: null,
          focusArea: "Approach",
          notes: "Use alignment checkpoints and three-shot dispersion sets.",
        },
      ],
      skillRatings: [
        { key: "driving", label: "Driving", value: 7, trend: "Improving", note: "Speed is a weapon when target is committed." },
        { key: "approach", label: "Approach", value: 5, trend: "Needs Focus", note: "Left pattern under pressure needs attention." },
        { key: "shortGame", label: "Short Game", value: 7, trend: "Steady", note: "Bunker touch creates scoring saves." },
        { key: "putting", label: "Putting", value: 6, trend: "Steady", note: "Lag putting is solid." },
        { key: "courseManagement", label: "Course Management", value: 5, trend: "Needs Focus", note: "Needs better conservative target selection." },
        { key: "mentalGame", label: "Mental Game", value: 6, trend: "Improving", note: "Responds faster after one poor shot." },
      ],
      coachNotes: [
        {
          id: "note-cam-1",
          date: toDateKey(addDays(today, -1)),
          author: "Coach",
          note: "Approach station exposed the left-start pattern. Keep alignment stick work in warmups.",
        },
      ],
      lastReviewDate: toDateKey(addDays(today, -28)),
      nextReviewDate: toDateKey(addDays(today, 2)),
      planStatus: "Active",
    },
    {
      id: "development-jordan",
      player: players[2],
      summary: "Early development plan focused on short-game confidence and simple course-management rules.",
      strengths: ["Putting touch", "Coachability", "Practice consistency"],
      improvementAreas: ["Driver contact", "Greenside decision-making"],
      goals: [
        {
          id: "goal-jordan-short-game",
          title: "Finish short-game ladder with 70 percent conversion",
          status: "Upcoming",
          dueDate: toDateKey(addDays(today, 21)),
          completedDate: null,
          focusArea: "Short Game",
          notes: "Begin after next review check-in.",
        },
      ],
      skillRatings: [
        { key: "driving", label: "Driving", value: 4, trend: "Needs Focus", note: "Contact quality is the first priority." },
        { key: "approach", label: "Approach", value: 5, trend: "Steady", note: "Solid mid-iron progress." },
        { key: "shortGame", label: "Short Game", value: 5, trend: "Improving", note: "More confident with basic chip choices." },
        { key: "putting", label: "Putting", value: 7, trend: "Steady", note: "Natural speed control." },
        { key: "courseManagement", label: "Course Management", value: 5, trend: "Improving", note: "Learning where bogey is acceptable." },
        { key: "mentalGame", label: "Mental Game", value: 6, trend: "Steady", note: "Consistent effort level." },
      ],
      coachNotes: [
        {
          id: "note-jordan-1",
          date: toDateKey(addDays(today, -6)),
          author: "Coach",
          note: "Good response to simplified tee-shot plan. Keep goals small and measurable.",
        },
      ],
      lastReviewDate: toDateKey(addDays(today, -41)),
      nextReviewDate: toDateKey(addDays(today, -1)),
      planStatus: "Draft",
    },
    {
      id: "development-morgan",
      player: players[3],
      summary: "Maintaining elite short-game profile while adding a more assertive scoring mindset.",
      strengths: ["Short game creativity", "Putting under pressure", "Leadership"],
      improvementAreas: ["Driver start line", "Aggressive target commitment"],
      goals: [
        {
          id: "goal-morgan-mental",
          title: "Complete three pressure-scenario journals",
          status: "Completed",
          dueDate: toDateKey(addDays(today, -8)),
          completedDate: toDateKey(addDays(today, -9)),
          focusArea: "Mental Game",
          notes: "Journals reviewed during last check-in.",
        },
      ],
      skillRatings: [
        { key: "driving", label: "Driving", value: 6, trend: "Improving", note: "Start line is stabilizing." },
        { key: "approach", label: "Approach", value: 7, trend: "Steady", note: "Consistent middle-green discipline." },
        { key: "shortGame", label: "Short Game", value: 9, trend: "Steady", note: "Team benchmark around the green." },
        { key: "putting", label: "Putting", value: 8, trend: "Steady", note: "Strong pressure conversion." },
        { key: "courseManagement", label: "Course Management", value: 7, trend: "Improving", note: "More decisive on scoring holes." },
        { key: "mentalGame", label: "Mental Game", value: 8, trend: "Improving", note: "Leadership habits are visible." },
      ],
      coachNotes: [
        {
          id: "note-morgan-1",
          date: toDateKey(addDays(today, -4)),
          author: "Coach",
          note: "Strong example for younger players in short-game block. Keep pushing assertive tee targets.",
        },
      ],
      lastReviewDate: toDateKey(addDays(today, -9)),
      nextReviewDate: toDateKey(addDays(today, 17)),
      planStatus: "Active",
    },
  ];
};

const goalStatusRank: Record<DevelopmentGoalStatus, number> = {
  Active: 0,
  Upcoming: 1,
  Completed: 2,
};

const toPlanListItem = (plan: DevelopmentPlan, today: Date): PlayerDevelopmentListItem => {
  const daysUntilReview = getDaysUntil(plan.nextReviewDate, today);
  const reviewDetail =
    daysUntilReview < 0
      ? `Review overdue by ${Math.abs(daysUntilReview)} ${Math.abs(daysUntilReview) === 1 ? "day" : "days"}`
      : `Next review ${formatShortDateLabel(plan.nextReviewDate)}`;

  return {
    id: plan.id,
    title: plan.player.name,
    detail: `${plan.player.teamName} / ${plan.player.classYear} - ${reviewDetail}`,
    meta: plan.planStatus,
    status: plan.planStatus,
  };
};

const toGoalListItem = (plan: DevelopmentPlan, goal: DevelopmentGoal): PlayerDevelopmentListItem => ({
  id: goal.id,
  title: goal.title,
  detail: `${plan.player.name} - ${goal.focusArea} - Due ${formatShortDateLabel(goal.dueDate)}`,
  meta: goal.status,
  status: goal.status,
});

const toReviewListItem = (plan: DevelopmentPlan, today: Date): PlayerDevelopmentListItem => {
  const daysUntilReview = getDaysUntil(plan.nextReviewDate, today);
  const meta = daysUntilReview < 0 ? "Overdue" : daysUntilReview <= 7 ? "This Week" : "Scheduled";

  return {
    id: `${plan.id}-review`,
    title: plan.player.name,
    detail: `Last reviewed ${formatShortDateLabel(plan.lastReviewDate)} - Next review ${formatShortDateLabel(plan.nextReviewDate)}`,
    meta,
    status: meta,
  };
};

const toNoteListItem = (plan: DevelopmentPlan, note: CoachNote): PlayerDevelopmentListItem => ({
  id: note.id,
  title: `${plan.player.name} - ${formatShortDateLabel(note.date)}`,
  detail: note.note,
  meta: note.author,
});

const buildSkillRatingGroups = (plans: DevelopmentPlan[]): SkillRatingGroupReadModel[] =>
  skillKeys.map((key) => {
    const ratings = plans
      .map((plan) => {
        const rating = plan.skillRatings.find((item) => item.key === key);
        return rating
          ? {
              playerName: plan.player.name,
              value: rating.value,
              trend: rating.trend,
              note: rating.note,
            }
          : null;
      })
      .filter((rating): rating is NonNullable<typeof rating> => Boolean(rating));
    const average = ratings.length > 0 ? ratings.reduce((sum, rating) => sum + rating.value, 0) / ratings.length : 0;
    const topRating = [...ratings].sort((left, right) => right.value - left.value)[0];

    return {
      key,
      label: skillLabels[key],
      average: average.toFixed(1),
      topPlayer: topRating ? `${topRating.playerName} (${topRating.value})` : "No ratings",
      needsFocusCount: ratings.filter((rating) => rating.trend === "Needs Focus").length,
      ratings,
    };
  });

const toPlayerDetail = (plan: DevelopmentPlan, today: Date): PlayerDevelopmentDetailReadModel => ({
  id: plan.id,
  playerName: plan.player.name,
  playerMeta: `${plan.player.teamName} / ${plan.player.classYear}`,
  planStatus: plan.planStatus,
  developmentSummary: plan.summary,
  strengths: plan.strengths,
  improvementAreas: plan.improvementAreas,
  currentGoals: plan.goals
    .filter((goal) => goal.status !== "Completed")
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate))
    .map((goal) => toGoalListItem(plan, goal)),
  skillRatings: plan.skillRatings,
  progressTimelinePlaceholder: "Progress timeline will appear after historical review snapshots are introduced.",
  recentNotes: plan.coachNotes
    .slice()
    .sort((left, right) => right.date.localeCompare(left.date))
    .map((note) => toNoteListItem(plan, note)),
  upcomingReview: toReviewListItem(plan, today),
});

export const loadPlayerDevelopmentReadModel = (today: Date = new Date()): PlayerDevelopmentReadModel => {
  const generatedAt = new Date().toISOString();
  const normalizedToday = startOfDay(today);
  const plans = getFixturePlans(normalizedToday);
  const activePlans = plans.filter((plan) => plan.planStatus === "Active");
  const allGoals = plans
    .flatMap((plan) => plan.goals.map((goal) => ({ plan, goal })))
    .sort((left, right) => {
      const statusSort = goalStatusRank[left.goal.status] - goalStatusRank[right.goal.status];
      return statusSort === 0 ? left.goal.dueDate.localeCompare(right.goal.dueDate) : statusSort;
    });
  const goalsCompleted = allGoals.filter(({ goal }) => goal.status === "Completed").length;
  const reviewItems = plans
    .map((plan) => ({ plan, daysUntilReview: getDaysUntil(plan.nextReviewDate, normalizedToday) }))
    .sort((left, right) => left.daysUntilReview - right.daysUntilReview);
  const playersNeedingReview = reviewItems.filter((item) => item.daysUntilReview <= 7);
  const upcomingReviews = reviewItems.filter((item) => item.daysUntilReview >= 0 && item.daysUntilReview <= 21);
  const recentCoachNotes = plans
    .flatMap((plan) => plan.coachNotes.map((note) => ({ plan, note })))
    .sort((left, right) => right.note.date.localeCompare(left.note.date))
    .slice(0, 6)
    .map(({ plan, note }) => toNoteListItem(plan, note));

  return {
    generatedAt,
    currentDateLabel: formatDateLabel(normalizedToday),
    dashboardCards: [
      {
        label: "Players Needing Review",
        value: String(playersNeedingReview.length),
        detail: "Reviews due within 7 days or overdue",
      },
      {
        label: "Goals Completed",
        value: String(goalsCompleted),
        detail: "Completed goals in the current read-only sample",
      },
      {
        label: "Upcoming Reviews",
        value: String(upcomingReviews.length),
        detail: "Reviews scheduled in the next 21 days",
      },
      {
        label: "Active Development Plans",
        value: String(activePlans.length),
        detail: "Plans currently marked active",
      },
    ],
    developmentPlans: reviewItems.map(({ plan }) => toPlanListItem(plan, normalizedToday)),
    goals: allGoals.map(({ plan, goal }) => toGoalListItem(plan, goal)),
    skillRatings: buildSkillRatingGroups(plans),
    reviewSchedule: reviewItems.map(({ plan }) => toReviewListItem(plan, normalizedToday)),
    recentCoachNotes,
    selectedPlayer: plans[0] ? toPlayerDetail(plans[0], normalizedToday) : null,
  };
};
