import { describe, expect, it } from "vitest";
import { canStartGame, validateCreateGame, type CreateGameDraft } from "../create-validation";

const good:CreateGameDraft={displayNo:"202609291230",date:"2026-09-29",time:"12:30",stadium:"s",weather:"晴れ",method:"ライブ",season:"秋季",kind:"リーグ戦",week:"1",day:"1",gameNumber:"1",umpire:"主審",teams:["a","b"].map(team=>({id:team,lineup:Array.from({length:9},(_,i)=>({playerId:`${team}-${i}`,position:String(i+1)}))}))};
describe("new scoring game validation",()=>{
 it("accepts a complete game with two unique lineups",()=>expect(validateCreateGame(good).valid).toBe(true));
 it("reports required fields, incomplete lineups and duplicate positions or players",()=>{const broken=structuredClone(good);broken.date="";broken.teams[0].lineup[1].playerId=broken.teams[0].lineup[0].playerId;broken.teams[1].lineup[1].position="1";const result=validateCreateGame(broken);expect(result.valid).toBe(false);expect(result.missing.join(" ")).toContain("日付");expect(result.missing.join(" ")).toContain("選手重複");expect(result.missing.join(" ")).toContain("守備位置重複")});
 it("allows only one in-progress game",()=>{expect(canStartGame([{status:"suspended"},{status:"completed"}])).toBe(true);expect(canStartGame([{status:"in_progress"}])).toBe(false)});
});
