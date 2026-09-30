import type { Page, Hand, Substitution } from './engine';
import { COLUMN191_HEADERS } from './export191';

export type Saved191Row = Array<string | number | null | undefined>;
export type Imported191Game = {
  game: { dateTime:string; season:string; kind:string; week:string; day:string; gameNumber:number; umpire?:string; homeTeam:string; awayTeam:string };
  lineups: Array<{ team_id:string; slot:number; position_id:number; uniform_no:number; batting_hand:Hand|null; throwing_hand:Hand|null; player_snapshot:{id:string;name:string;uniform_no:number} }>;
  plays: Array<{seq:number;page:Page}>;
  masters: { ballTypes:Array<{name:string;old_excel_label:string}> };
};
const value=(row:Saved191Row,col:number)=>row[col-1] == null?'':String(row[col-1]);
const number=(row:Saved191Row,col:number)=>Number(value(row,col))||0;
const hand=(s:string):Hand|null=>s==='左'?'左':s==='両'?'両':s==='右'?'右':null;
const positions:Record<string,number>={P:1,C:2,'1B':3,'2B':4,'3B':5,SS:6,LF:7,CF:8,RF:9,D:10};
const resultKind:Record<string,string|number>={見逃し:'FO',空振り:'FO',ボール:'B',ファール:'FO',ファウル:'FO',ハーフスイング:'FO',見逃し三振:'io',空振り三振:'io',単打:1,二塁打:2,三塁打:3,本塁打:4,ランニング本塁打:4,四球:'B',敬遠:'IBB',死球:'hbp',凡打死:'out',凡打出塁:'e',ファールフライ:'out',犠打:'sac',犠飛:'sf',エラー:'e',野手選択:'fc',振り逃げ:'e',スリーバント失敗:'io',打撃妨害:'io',守備妨害:'io',走塁妨害:'io',ボーク:'BK'};

/** Convert rows in saved-file order into editable game, lineup and page objects. */
export function import191(rows:Saved191Row[], headers:readonly string[]=COLUMN191_HEADERS):Imported191Game {
  if(headers.length!==191) throw new Error('191列の見出しが必要です');
  const data=rows.filter(r=>r.some(v=>v!=null&&v!==''));
  if(!data.length) throw new Error('取込対象のプレイ行がありません');
  const first=data[0];
  const game={dateTime:value(first,1),season:value(first,2),kind:value(first,3),week:value(first,4),day:value(first,5),gameNumber:number(first,6),umpire:value(first,7),homeTeam:'home',awayTeam:'away'};
  const lineupByTeam=[new Map<string,{no:number;pos:number;bat:Hand|null;throw:Hand|null;slot:number}>(),new Map<string,{no:number;pos:number;bat:Hand|null;throw:Hand|null;slot:number}>()];
  const currentSlots=[new Map<number,string>(),new Map<number,string>()];
  const playerIds=[new Map<string,number>(),new Map<string,number>()];
  const safeName=(t:number,nm:string)=>{let id=playerIds[t].get(nm);if(!id){id=playerIds[t].size+1;playerIds[t].set(nm,id)}return `${t===0?'away':'home'}-player-${id}`};
  const playerId=(t:number,nm:string)=>Number(safeName(t,nm).split('-').at(-1));
  const capture=(r:Saved191Row)=>{
    for(let t=0;t<2;t++){
      const posStart=t===0?58:77, handStart=t===0?96:116, team=lineupByTeam[t];
      for(let i=0;i<9;i++){
        const player=value(r,posStart+i*2); const sourceName=value(r,posStart+i*2+1);if(!sourceName)continue;const nm=safeName(t,sourceName);
        const prior=team.get(nm);team.set(nm,{no:prior?.no??playerId(t,nm),pos:positions[player] ?? (Number(player)||prior?.pos||10),bat:hand(value(r,handStart+i*2))??prior?.bat??null,throw:prior?.throw??null,slot:i+1});currentSlots[t].set(i+1,nm);
      }
      const sourcePitcher=value(r,t===0?76:95);if(sourcePitcher){const pn=safeName(t,sourcePitcher);const prior=team.get(pn);team.set(pn,{no:prior?.no??playerId(t,sourcePitcher),pos:1,bat:null,throw:hand(value(r,t===0?114:134))??prior?.throw??null,slot:10});currentSlots[t].set(10,pn)}
    }
  };
  capture(first);
  const plays=data.map((r,index)=>{
    const p:Page={subs:[],tb:null,pitch_type:value(r,45)==='0'?null:value(r,45)||null,course:number(r,43)||number(r,44)?[number(r,43),number(r,44)]:null,catcher_mitt_position:number(r,42),ball_speed:value(r,57)==='0'?'':value(r,57),res:null,flags:[],plan:{},batted_ball:number(r,51)||number(r,52)?{x:number(r,51),y:number(r,52)}:null,feature:value(r,49)==='ゴロ'?1:value(r,49)==='フライ'?2:value(r,49)==='ライナー'?3:value(r,49)==='ぽてん'?4:value(r,49)==='ボテゴロ'?5:0,rank:value(r,50)||null,catch_fielder:number(r,48)?[number(r,48)]:[],ra:{},pickoff_throw_to:0,skip:false,skipOut:null,memo:'',time:null,handP:hand(value(r,34)),handB:hand(value(r,29))};
    const rawResult=value(r,46);if(rawResult&&rawResult!=='0')p.res={label:rawResult,kind:resultKind[rawResult]??'io'};
    if(value(r,47)==='WP'||value(r,47)==='PB')p.flags.push(value(r,47));
    p.pickoff_throw_to=number(r,53) || ({一塁牽制:1,二塁牽制:2,三塁牽制:3}[value(r,53)]??0);
    p.skip=value(r,45)==='0'&&!!rawResult;
    const to:Record<string,number>={継続:0,残留:0,二進:2,三進:3,本進:4};
    for(let base=1;base<=3;base++) {const status=value(r,36+base);if(!status||status==='0')continue;const dest=to[status];p.ra[base]=status.includes('死')||status==='封殺'?{out:true}:dest?{to:dest}:{back:true};}
    const bst=value(r,40);if(bst==='アウト'||bst==='出塁'||bst==='二進'||bst==='三進'||bst==='本進')p.ra[0]=bst==='アウト'?{out:true}:{to:bst==='出塁'?1:bst==='二進'?2:bst==='三進'?3:4};
    const type=value(r,41);if(type==='牽制'&&!p.pickoff_throw_to)p.pickoff_throw_to=number(r,53);
    if(value(r,31)&&value(r,31)!=='0')p.plan.primary=value(r,31);
    if(value(r,30)&&value(r,30)!=='0')p.plan.code=value(r,30);
    for(let t=0;t<2;t++){
      const start=t===0?58:77,handStart=t===0?96:116;
      for(let slot=1;slot<=9;slot++){
        const sourceAfter=value(r,start+(slot-1)*2+1),before=currentSlots[t].get(slot)??'';if(!sourceAfter)continue;const after=safeName(t,sourceAfter);
        const posRaw=value(r,start+(slot-1)*2),entry=lineupByTeam[t].get(after),pos=positions[posRaw]??(Number(posRaw)||entry?.pos||10);
        if(before&&after!==before)p.subs.push({t:t as 0|1,slot:slot-1,no:entry?.no??playerId(t,after),bats:hand(value(r,handStart+(slot-1)*2))??undefined,pos});
        else if(before&&pos!==lineupByTeam[t].get(before)?.pos)p.subs.push({t:t as 0|1,slot:slot-1,no:null,pos});
      }
      const sourceAfter=value(r,t===0?76:95),before=currentSlots[t].get(10)??'';
      if(sourceAfter&&before){const after=safeName(t,sourceAfter);if(after!==before){const entry=lineupByTeam[t].get(after);p.subs.push({t:t as 0|1,slot:'P',no:entry?.no??playerId(t,sourceAfter),throws:hand(value(r,t===0?114:134))??undefined,pos:1});}}
    }
    capture(r);
    return {seq:number(r,10)||index+1,page:p};
  });
  const lineups=lineupByTeam.flatMap((m,t)=>[...m].map(([name,p])=>({team_id:t===0?'away':'home',slot:p.slot,position_id:p.pos,uniform_no:p.no,batting_hand:p.bat,throwing_hand:p.throw,player_snapshot:{id:name,name,uniform_no:p.no}})));
  return {game,lineups,plays,masters:{ballTypes:[...new Set(data.map(r=>value(r,45)).filter(x=>x&&x!=='0'))].map(name=>({name,old_excel_label:name}))}};
}
