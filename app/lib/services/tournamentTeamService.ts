export type TournamentTeamDraft = {
  clientKey: string;
  label: string;
  displayOrder: number;
};

export const tournamentTeamRosterSlotCount = 5;

const teamLabel = (index: number) => {
  let value = index;
  let suffix = "";
  do {
    suffix = String.fromCharCode(65 + (value % 26)) + suffix;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return `Team ${suffix}`;
};

export const createDefaultTournamentTeams = (): TournamentTeamDraft[] => [{
  clientKey: "team-a",
  label: "Team A",
  displayOrder: 1,
}];

export const addNextTournamentTeam = (teams: TournamentTeamDraft[]): TournamentTeamDraft[] => {
  const index = Math.max(0, ...teams.map((team) => team.displayOrder));
  const label = teamLabel(index);
  return [...teams, {
    clientKey: `team-${label.slice(5).toLowerCase()}`,
    label,
    displayOrder: Math.max(0, ...teams.map((team) => team.displayOrder)) + 1,
  }];
};

export const removeTournamentTeam = (
  teams: TournamentTeamDraft[],
  clientKey: string
): TournamentTeamDraft[] => teams.filter((team) => team.clientKey !== clientKey);
