import { describe, expect, it } from "vitest";
import { blank, type Page } from "./engine";
import { toAnalysisPitches } from "./to-pitches";

const lineup = [0,1].flatMap(side => Array.from({length:10},(_,slot)=>({team_id:side?"home":"away",slot:slot+1,roster_player_id:`${side}-${slot}`,position_id:slot===9?1:slot+1,uniform_no:String(slot+1),batting_hand:"R",throwing_hand:"R",player_snapshot:{name:`${side}-${slot+1}`}})));
const page = (kind?: string|number, label="", extra:Partial<Page>={}):Page=>({...blank(),res:kind==null?null:{kind,label},...extra});
const rows=(plays:Page[])=>toAnalysisPitches({gameId:"g",plays:plays.map((page,i)=>({seq:i+1,page})),lineup,teamIds:["away","home"],teamNames:["先攻","後攻"],gameDate:"2026-09-30",gameTime:"10:00",season:"秋季",kind:"リーグ戦",week:"1",day:"1",gameNumber:1});

describe("scoring pages to analysis pitch rows",()=>{
  it("stores pre-pitch count progression",()=>{const result=rows([page("B","ボール"),page("S","空振"),page("B","ボール")]);expect(result.map(x=>[x.balls,x.strikes])).toEqual([[0,0],[1,0],[1,1]]);});
  it("maps a hit and captures runners before the pitch",()=>{const result=rows([page(1,"単打"),page(2,"二塁打")]);expect(result[1].runner_1st).toBe("0-1");expect(result[1].batting_result).toBe("二塁打");});
  it("marks strikeout as a completed plate appearance",()=>{const p=page("S","空振",{ra:{0:{out:true}}});expect(rows([p])[0].pa_complete).toBe("打席完了");expect(rows([p])[0].batting_result).toBe("空振り");});
  it("marks a four-ball walk as completed",()=>{const result=rows([page("B","ボール"),page("B","ボール"),page("B","ボール"),page("B","ボール")]);expect(result[3].pa_complete).toBe("打席完了");});
  it("tracks the inning transition after the third out",()=>{const p=page("out","凡打");const result=rows([p,p,p,page("B","ボール")]);expect(result[3].inning).toBe(1);expect(result[3].top_bottom).toBe("裏");expect(result[3].outs).toBe(0);});
  it("applies a substitution before resolving the current batter",()=>{const p=page("B","ボール",{subs:[{t:0,slot:0,no:22,bats:"左"}]});const result=rows([p]);expect(result[0].batter_name).toBe("22");expect(result[0].batter_hand).toBe("左");});
});
