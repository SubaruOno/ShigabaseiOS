import { describe, expect, it } from "vitest";
import { blank, type Page } from "../engine";
import { applyRenumber, planRenumber } from "../renumber";

const teams: [string, string] = ["A", "H"];
const lineup: any[] = [
  { team_id: "A", slot: 1, roster_player_id: "a1", uniform_no: "1", player_snapshot: { name: "甲" } },
  { team_id: "A", slot: 10, roster_player_id: "a9", uniform_no: "9", player_snapshot: { name: "乙" } },
  { team_id: "H", slot: 1, roster_player_id: "h1", uniform_no: "1", player_snapshot: { name: "丙" } },
];
const sub = (no: number): Page => ({ ...blank(), subs: [{ t: 0, slot: 1, no }] });

describe("planRenumber", () => {
  it("スタメンと交代の背番号を、マスターの今の番号に合わせる", () => {
    const roster = [
      { id: "a1", team_id: "A", name: "甲", uniform_no: "11" },
      { id: "a9", team_id: "A", name: "乙", uniform_no: "9" },
      { id: "a5", team_id: "A", name: "丁", uniform_no: "25", show_index: 5 },
      { id: "h1", team_id: "H", name: "丙", uniform_no: "1" },
    ];
    // 交代で入った5番は、名簿で今5番を持つ選手がいないので付け替えない（持ち主が分からない）
    const plan = planRenumber([sub(5)], lineup, teams, roster);
    expect(plan.conflict).toBeNull();
    expect(plan.changes).toEqual([{ team: 0, from: 1, to: 11, name: "甲" }]);
    const out = applyRenumber([sub(1)], lineup, teams, plan.changes, () => 0);
    expect(out.lineup[0].uniform_no).toBe("11");
    expect(out.lineup[0].player_snapshot.uniform_no).toBe(11);
    expect(out.pages[0].subs[0].no).toBe(11);
    expect(out.lineup[2].uniform_no).toBe("1"); // 相手チームの1番はそのまま
  });

  it("付け替えると同じ番号が2人になるときは止める", () => {
    const roster = [
      { id: "a1", team_id: "A", name: "甲", uniform_no: "9" },
      { id: "a9", team_id: "A", name: "乙", uniform_no: "9" },
    ];
    expect(planRenumber([], lineup, teams, roster).conflict).toContain("9番");
  });

  it("番号を入れ替える（1⇔9）ときも、一度にまとめて付け替える", () => {
    const roster = [
      { id: "a1", team_id: "A", name: "甲", uniform_no: "9" },
      { id: "a9", team_id: "A", name: "乙", uniform_no: "1" },
    ];
    const plan = planRenumber([], lineup, teams, roster);
    expect(plan.conflict).toBeNull();
    const out = applyRenumber([], lineup, teams, plan.changes, () => 0);
    expect(out.lineup.slice(0, 2).map(r => r.uniform_no)).toEqual(["9", "1"]);
  });

  it("タイブレークの走者も、その回の攻撃側の番号で付け替える", () => {
    const roster = [{ id: "a1", team_id: "A", name: "甲", uniform_no: "11" }, { id: "a9", team_id: "A", name: "乙", uniform_no: "9" }];
    const p: Page = { ...blank(), tb: { bi: 0, r: [null, 1, null] } };
    const plan = planRenumber([], lineup, teams, roster);
    expect(applyRenumber([p], lineup, teams, plan.changes, () => 0).pages[0].tb!.r).toEqual([null, 11, null]);
    expect(applyRenumber([p], lineup, teams, plan.changes, () => 1).pages[0].tb!.r).toEqual([null, 1, null]);
  });
});
