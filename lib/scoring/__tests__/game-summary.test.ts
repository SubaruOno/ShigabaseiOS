import { describe, expect, it } from "vitest";
import { blank, initState, type Page } from "../engine";
import { inningsText, summarizeGame } from "../game-summary";
const page = (label: string, kind: string | number, extra: Partial<Page> = {}): Page => ({ ...blank(), res: { label, kind }, ...extra });
const setups = initState().lu;
describe("試合編集の集計", () => {
  it("打席ごとの結果と、結果のページの番号", () => {
    const pages = [page("ボール", "B"), page("単打", 1), page("凡打", "out")];
    const s = summarizeGame(pages, setups);
    expect(s.pas.map(x => [x.slot, x.text, x.page])).toEqual([[0, "単打", 1], [1, "凡打", 2]]);
  });
  it("投手の球数・打者数・安打・アウト", () => {
    const pages = [page("ボール", "B"), page("単打", 1), page("凡打", "out"), page("凡打", "out"), page("凡打", "out")];
    const p = summarizeGame(pages, setups).pitchers.find(x => x.team === 1)!;
    expect([p.pitches, p.batters, p.hits, p.outs]).toEqual([5, 4, 1, 3]);
  });
  it("投球回は1/3単位", () => { expect(inningsText(7)).toBe("2 1/3"); expect(inningsText(9)).toBe("3"); });
});
