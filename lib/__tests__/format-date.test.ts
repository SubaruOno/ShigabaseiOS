import { describe, expect, it } from "vitest";
import { formatDate } from "../format-date";
describe("formatDate", () => {
  it("日付だけはそのまま", () => expect(formatDate("2026-10-01")).toBe("2026/10/1"));
  it("時刻付きは日本時間の日付（朝8時半の試合が前日にならない）", () => expect(formatDate("2026-09-30T23:30:00+00:00")).toBe("2026/10/1"));
  it("昼の試合", () => expect(formatDate("2026-09-24 03:26:34+00")).toBe("2026/9/24"));
  it("日本時間の0時", () => expect(formatDate("2026-09-30T15:00:00Z")).toBe("2026/10/1"));
});
