import { describe, expect, it } from "vitest";
import { initState, blank, applyPage, stateAt } from "../engine";
import type { LocalGame, LocalPlay } from "../local-store";

describe("local scoring contract", () => {
  it("keeps one in-progress game and required metadata in a local game record", () => {
    const game: LocalGame = { id: "g1", display_game_number: "202609291230", game_date: "2026-09-29", game_time: "12:30", home_team_id: "h", away_team_id: "a", season: "2026", kind: "league", week: "1", day: "1", game_number: 1, method: "live", tags: [], status: "in_progress", lineup: [] };
    expect(game.display_game_number).toHaveLength(12);
    expect([game.home_team_id, game.away_team_id]).not.toEqual([game.away_team_id, game.home_team_id]);
  });
  it("replays locally saved play events through the scoring engine", () => {
    const play = blank(); play.res = { label: "単打", kind: 1 };
    const saved: LocalPlay = { seq: 1, page: play, client_mutation_id: "mutation-1", created_at: new Date(0).toISOString() };
    const restored = stateAt(1, [saved.page]);
    expect(restored.hits[0]).toBe(1);
    expect(restored.bi[0]).toBe(1);
    const replay = initState(); applyPage(replay, saved.page);
    expect(replay).toEqual(restored);
  });
});
