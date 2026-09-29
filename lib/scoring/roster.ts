export type RosterPlayer = {
  id: string;
  team_id: string;
  show_index: number;
  [key: string]: unknown;
};

export type PlayerCareer = {
  roster_player_id: string;
  team_id: string;
  uniform_no: string | null;
};

/** Attach the uniform number for the player's current team career. */
export function buildRosterPlayers<T extends RosterPlayer>(
  players: T[],
  careers: PlayerCareer[],
): Array<T & { uniform_no: string | number }> {
  const numbers = new Map<string, string>();
  for (const career of careers) {
    if (career.uniform_no != null) numbers.set(`${career.team_id}:${career.roster_player_id}`, career.uniform_no);
  }
  return players.map(player => ({
    ...player,
    uniform_no: numbers.get(`${player.team_id}:${player.id}`) ?? player.show_index,
  }));
}
