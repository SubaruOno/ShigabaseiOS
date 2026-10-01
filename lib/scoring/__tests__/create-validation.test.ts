import { describe, expect, it } from "vitest";
import { canStartGame, validateCreateGame, type CreateGameDraft } from "../create-validation";

const good:CreateGameDraft={displayNo:"202609291230",date:"2026-09-29",time:"12:30",stadium:"s",weather:"晴れ",method:"ライブ",season:"秋季",kind:"リーグ戦",week:"1",day:"1",gameNumber:"1",umpire:"主審",teams:["a","b"].map(team=>({id:team,lineup:Array.from({length:9},(_,i)=>({playerId:`${team}-${i}`,position:String(i+1)}))}))};
describe("new scoring game validation",()=>{
 it("accepts a complete game with two unique lineups",()=>expect(validateCreateGame(good).valid).toBe(true));
 it("reports required fields, incomplete lineups and duplicate positions or players",()=>{const broken=structuredClone(good);broken.date="";broken.teams[0].lineup[1].playerId=broken.teams[0].lineup[0].playerId;broken.teams[1].lineup[1].position="1";const result=validateCreateGame(broken);expect(result.valid).toBe(false);expect(result.missing.join(" ")).toContain("日付");expect(result.missing.join(" ")).toContain("選手重複");expect(result.missing.join(" ")).toContain("守備位置の重複")});
 it("allows only one in-progress game",()=>{expect(canStartGame([{status:"suspended"},{status:"completed"}])).toBe(true);expect(canStartGame([{status:"in_progress"}])).toBe(false)});
});

import { sameGameExists } from "../create-validation";
describe("同じ試合の重複", () => {
  const g = { id: "a", season: "秋季", kind: "リーグ戦", week: "1", day: "1", game_number: 1 };
  it("リーグ戦で季節・週・日・第何試合が同じなら重複", () => expect(sameGameExists([g], { season: g.season, kind: g.kind, week: g.week, day: g.day, game_number: g.game_number })).toBe(true));
  it("第何試合が違えば重複でない", () => expect(sameGameExists([g], { ...g, game_number: 2 })).toBe(false));
  it("オープン戦は週などが空なので止めない", () => expect(sameGameExists([{ ...g, kind: "オープン戦" }], { ...g, kind: "オープン戦" })).toBe(false));
  it("自分自身は数えない", () => expect(sameGameExists([g], g, "a")).toBe(false));
});
