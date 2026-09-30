import { describe, expect, it } from "vitest";
import { blank, type Page } from "./engine";
import { scoreLine, toAnalysisPitches } from "./to-pitches";

const lineup = [0,1].flatMap(side => Array.from({length:10},(_,slot)=>({team_id:side?"home":"away",slot:slot+1,roster_player_id:`${side}-${slot}`,position_id:slot===9?1:slot+1,uniform_no:String(slot+1),batting_hand:"R",throwing_hand:"R",player_snapshot:{name:`${side}-${slot+1}`}})));
const page = (kind?: string|number, label="", extra:Partial<Page>={}):Page=>({...blank(),res:kind==null?null:{kind,label},...extra});
const rows=(plays:Page[])=>toAnalysisPitches({gameId:"g",plays:plays.map((page,i)=>({seq:i+1,page})),lineup,teamIds:["away","home"],teamNames:["先攻","後攻"],gameDate:"2026-09-30",gameTime:"10:00",season:"秋季",kind:"リーグ戦",week:"1",day:"1",gameNumber:1});

describe("scoring pages to analysis pitch rows",()=>{
  it("stores pre-pitch count progression",()=>{const result=rows([page("B","ボール"),page("S","空振"),page("B","ボール")]);expect(result.map(x=>[x.balls,x.strikes])).toEqual([[0,0],[1,0],[1,1]]);});
  it("maps a hit and captures runners before the pitch",()=>{const result=rows([page(1,"単打"),page(2,"二塁打")]);expect(result[1].runner_1st).toBe("0-1");expect(result[1].batting_result).toBe("二塁打");});
  it("marks strikeout as a completed plate appearance",()=>{const p=page("S","空振",{tb:{bi:0,r:[null,null,null],s:2},ra:{0:{out:true}}});expect(rows([p])[0].pa_complete).toBe("打席完了");expect(rows([p])[0].batting_result).toBe("空振り三振");});
  it("marks a four-ball walk as completed",()=>{const result=rows([page("B","ボール"),page("B","ボール"),page("B","ボール"),page("B","ボール")]);expect(result[3].pa_complete).toBe("打席完了");});
  it("tracks the inning transition after the third out",()=>{const p=page("out","凡打");const result=rows([p,p,p,page("B","ボール")]);expect(result[3].inning).toBe(1);expect(result[3].top_bottom).toBe("裏");expect(result[3].outs).toBe(0);});
  it("applies a substitution before resolving the current batter",()=>{const p=page("B","ボール",{subs:[{t:0,slot:0,no:22,bats:"左"}]});const result=rows([p]);expect(result[0].batter_name).toBe("22");expect(result[0].batter_hand).toBe("左");});
  it("maps engine results into saved-file batting vocabulary",()=>{
    const cases:[string|number,string,Partial<Page>,string][]=[
      ["out","凡打",{},"凡打死"],["out","邪飛",{},"ファールフライ"],["FO","見送",{},"見逃し"],["FO","空振",{},"空振り"],["FO","ファウル",{},"ファール"],["FO","邪飛",{},"ファールフライ"],
      ["e","失策出塁",{},"エラー"],["S","見送",{tb:{bi:0,r:[null,null,null],s:2},ra:{0:{out:true}}},"見逃し三振"],["S","空振",{tb:{bi:0,r:[null,null,null],s:2},ra:{0:{out:true}}},"空振り三振"],
      ["B","ボール",{},"ボール"],["B","ボール",{tb:{bi:0,r:[null,null,null],b:3}},"四球"],[1,"単打",{},"単打"],[2,"二塁打",{},"二塁打"],["sac","犠打",{},"犠打"],["sf","犠飛",{},"犠飛"],["fc","野選",{},"野手選択"],["hbp","死球",{},"死球"],["e","振り逃げ",{},"振り逃げ"],
    ];
    for(const [kind,label,extra,want] of cases){const result=rows([page(kind,label,extra)]);expect(result[0].batting_result).toBe(want);}
  });
  it("maps batted-ball feature and strength and preserves field coordinates",()=>{
    const result=rows([page("out","凡打",{feature:3,rank:"A",batted_ball:{x:109,y:72}})])[0];
    expect([result.hit_type,result.hit_strength,result.hit_x,result.hit_y]).toEqual(["ライナー","A",109,72]);
    expect(rows([page("out","凡打",{feature:1,rank:"2"})])[0].hit_strength).toBe("B");
  });
  it("omits blank pages and retains committed result, pickoff, and skip pages",()=>{
    const blankPage=page();const result=rows([blankPage,page("B","ボール"),page(undefined,"",{pickoff_throw_to:1}),page(undefined,"",{skip:true,ra:{0:{out:true}}}),page()]);
    expect(result).toHaveLength(3);expect(result.map(x=>x.batting_result)).toEqual(["ボール",null,null]);
  });
  it("calculates line score through the last committed page, excluding blank pages",()=>{
    const scored=page(1,"単打",{ra:{0:{to:4}}});
    const line=scoreLine({plays:[{seq:1,page:scored},{seq:2,page:page()}],lineup,teamIds:["away","home"],teamNames:["先攻","後攻"]});
    expect(line).toEqual({awayScore:1,homeScore:0,awayRunsPerInning:[1],homeRunsPerInning:[0]});
  });
});

describe('妨害は旧Excelと同じ語で書く', () => {
  it('守備妨害は凡打死にしない', async () => {
    const mod: any = await import('./to-pitches');
    const fn = mod.resultWords;
    const { blank, stateAt } = await import('./engine');
    const p = blank(); p.res = { label: '守備妨害', kind: 'out' };
    expect(fn(p, stateAt(0, []))).toBe('守備妨害');
  });
});
