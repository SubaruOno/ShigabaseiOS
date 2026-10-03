import { describe, expect, it } from "vitest";
import { fetchAll, PAGE_SIZE } from "../fetch-all";
describe("fetchAll", () => {
  it("1000行を超えても全部読み、重ならない", async () => {
    const all = Array.from({ length: 3198 }, (_, i) => i);
    const got = await fetchAll(async (from, to) => ({ data: all.slice(from, to + 1), error: null }));
    expect(got).toEqual(all);
  });
  it("ちょうど1000行の倍数でも止まる", async () => {
    const all = Array.from({ length: PAGE_SIZE * 2 }, (_, i) => i);
    const got = await fetchAll(async (from, to) => ({ data: all.slice(from, to + 1), error: null }));
    expect(got.length).toBe(PAGE_SIZE * 2);
  });
  it("エラーは投げる", async () => {
    await expect(fetchAll(async () => ({ data: null, error: new Error("x") }))).rejects.toThrow("x");
  });
});
