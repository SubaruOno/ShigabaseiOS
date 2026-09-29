import { describe, expect, it } from "vitest";
import { buildRosterPlayers } from "./roster";

describe("buildRosterPlayers", () => {
  it("joins current career numbers without mixing teams and falls back to show_index", () => {
    const players = [
      { id: "a1", team_id: "away", name: "選手A01", show_index: 1 },
      { id: "h1", team_id: "home", name: "選手B01", show_index: 1 },
      { id: "a2", team_id: "away", name: "選手A02", show_index: 2 },
    ];
    const careers = [
      { roster_player_id: "a1", team_id: "away", uniform_no: "11" },
      { roster_player_id: "h1", team_id: "home", uniform_no: "21" },
      { roster_player_id: "a1", team_id: "home", uniform_no: "99" },
    ];

    expect(buildRosterPlayers(players, careers)).toEqual([
      { ...players[0], uniform_no: "11" },
      { ...players[1], uniform_no: "21" },
      { ...players[2], uniform_no: 2 },
    ]);
  });
});
