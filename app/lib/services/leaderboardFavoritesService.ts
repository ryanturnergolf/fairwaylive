export type LeaderboardFavoriteSurface = "tournament-team" | "tournament-player" | "public-team" | "public-player" | "qualifying-player";

const prefix = "clubhouse-hq:leaderboard-favorites:v1";

export const getLeaderboardFavoritesKey = (surface: LeaderboardFavoriteSurface, eventId: string) =>
  `${prefix}:${surface}:${eventId}`;

export const readLeaderboardFavorites = (surface: LeaderboardFavoriteSurface, eventId: string) => {
  if (typeof window === "undefined" || !eventId) return new Set<string>();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(getLeaderboardFavoritesKey(surface, eventId)) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string" && value.length > 0) : []);
  } catch {
    return new Set<string>();
  }
};

export const writeLeaderboardFavorites = (
  surface: LeaderboardFavoriteSurface,
  eventId: string,
  favorites: ReadonlySet<string>
) => {
  if (typeof window === "undefined" || !eventId) return;
  window.localStorage.setItem(getLeaderboardFavoritesKey(surface, eventId), JSON.stringify([...favorites].sort()));
};

export const partitionLeaderboardFavorites = <T extends { id: string }>(rows: readonly T[], favorites: ReadonlySet<string>) => ({
  favorites: rows.filter((row) => favorites.has(row.id)),
  standings: rows.filter((row) => !favorites.has(row.id)),
});
