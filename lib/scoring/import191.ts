import type { Page, Hand, Substitution } from './engine';
import { applyPage, applyPre, initState, teamSetupsFromLineup } from './engine';
import { COLUMN191_HEADERS } from './export191';
import { convertSavedPageCoordinates } from './coords';

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
const positions:Record<string,number>={P:1,C:2,'1B':3,'2B':4,'3B':5,SS:6,LF:7,CF:8,RF:9,D:10,H:11,R:12};
const resultKind:Record<string,string|number>={見逃し:'S',空振り:'S',ボール:'B',ファール:'FO',ファウル:'FO',ハーフスイング:'FO',見逃し三振:'S',空振り三振:'S',単打:1,二塁打:2,三塁打:3,本塁打:4,ランニング本塁打:4,四球:'B',敬遠:'IBB',死球:'hbp',凡打死:'out',凡打出塁:'e',ファールフライ:'out',犠打:'sac',犠飛:'sf',エラー:'e',野手選択:'fc',振り逃げ:'e',スリーバント失敗:'io',打撃妨害:'io',守備妨害:'io',走塁妨害:'io',ボーク:'BK'};

/** Convert rows in saved-file order into editable game, lineup and page objects. */
// keepNames: 旧Excelの選手名・チーム名をそのまま残す（アプリで取り込むときはこちら）。false はテスト用に仮の名前へ置き換える
export function import191(rows:Saved191Row[], headers:readonly string[]=COLUMN191_HEADERS, opts:{keepNames?:boolean}={}):Imported191Game {
  if(headers.length!==191) throw new Error('191列の見出しが必要です');
  const data=rows.filter(r=>r.some(v=>v!=null&&v!==''));
  if(!data.length) throw new Error('取込対象のプレイ行がありません');
  const first=data[0];
  const game={dateTime:value(first,1),season:value(first,2),kind:value(first,3),week:value(first,4),day:value(first,5),gameNumber:value(first,6) as any,umpire:value(first,7),scorer:value(first,182),homeTeam:opts.keepNames?value(first,8):'home',awayTeam:opts.keepNames?value(first,9):'away'};
  const realName=new Map<string,string>();
  const lineupByTeam=[new Map<string,{no:number;pos:number;bat:Hand|null;throw:Hand|null;slot:number}>(),new Map<string,{no:number;pos:number;bat:Hand|null;throw:Hand|null;slot:number}>()];
  const currentSlots=[new Map<number,string>(),new Map<number,string>()];
  // 各打順の今の守備位置（交代や守備変更を1回だけ記録するため、行ごとに更新する）
  const currentPos=[new Map<number,number>(),new Map<number,number>()];
  const currentHand=[new Map<number,Hand>(),new Map<number,Hand>()];
  const playerIds=[new Map<string,number>(),new Map<string,number>()];
  const safeName=(t:number,nm:string)=>{let id=playerIds[t].get(nm);if(!id){id=playerIds[t].size+1;playerIds[t].set(nm,id)}const key=`${t===0?'away':'home'}-player-${id}`;realName.set(key,nm);return key};
  const playerId=(t:number,nm:string)=>Number(safeName(t,nm).split('-').at(-1));
  const capture=(r:Saved191Row)=>{
    for(let t=0;t<2;t++){
      const posStart=t===0?58:77, handStart=t===0?96:116, team=lineupByTeam[t];
      for(let i=0;i<9;i++){
        const player=value(r,posStart+i*2); const sourceName=value(r,posStart+i*2+1);if(!sourceName)continue;const nm=safeName(t,sourceName);
        const prior=team.get(nm);// 最初に入った枠（先発の打順）は後から上書きしない
        team.set(nm,{no:prior?.no??playerId(t,sourceName),pos:prior?.pos??(positions[player] ?? (Number(player)||10)),bat:prior?.bat??hand(value(r,handStart+i*2)),throw:prior?.throw??null,slot:prior?.slot??i+1});currentSlots[t].set(i+1,nm);
      }
      const sourcePitcher=value(r,t===0?76:95);if(sourcePitcher){const pn=safeName(t,sourcePitcher);// 大谷ルールで打者と同じ選手でも、投手の枠は別に持つ（背番号は同じ）
        const key=pn+'#P',asBatter=team.get(pn),prior=team.get(key);if(!prior)team.set(key,{no:asBatter?.no??playerId(t,sourcePitcher),pos:1,bat:null,throw:hand(value(r,t===0?114:134)),slot:10});currentSlots[t].set(10,key)}
    }
  };
  capture(first);
  const plays=data.map((r,index)=>{
    const p:Page={subs:[],tb:null,pitch_type:value(r,45)==='0'?null:value(r,45)||null,course:number(r,43)||number(r,44)?[number(r,43),number(r,44)]:null,catcher_mitt_position:number(r,42),ball_speed:value(r,57)==='0'?'':value(r,57),res:null,flags:[],plan:{},batted_ball:number(r,51)||number(r,52)?{x:number(r,51),y:number(r,52)}:null,feature:value(r,49)==='ゴロ'?1:value(r,49)==='フライ'?2:value(r,49)==='ライナー'?3:value(r,49)==='ぽてん'?4:value(r,49)==='ボテゴロ'?5:0,rank:value(r,50)||null,catch_fielder:number(r,48)?[number(r,48)]:[],ra:{},pickoff_throw_to:0,skip:false,skipOut:null,memo:'',time:null,handP:hand(value(r,34)),handB:hand(value(r,29))};
    const rawResult=value(r,46);if(rawResult&&rawResult!=='0')p.res={label:rawResult,kind:resultKind[rawResult]??'io'};
    // 結果が空（0）でも打者の状況が入っている投球の行（結果の入れ忘れ）：旧Excelどおり打者の動きだけで打席を終える
    else if(value(r,41)==='投球'&&value(r,40)&&value(r,40)!=='0')p.res={label:'0',kind:'none'};
    if(value(r,47)==='WP'||value(r,47)==='PB')p.flags.push(value(r,47));
    // 牽制の行（プレイの種類＝牽制）だけを牽制として扱う。投球の行に付いた牽制の印は、その言葉だけ残す
    p.pickoff_throw_to=value(r,41)==='牽制'?(number(r,53) || ({一塁牽制:1,二塁牽制:2,三塁牽制:3} as Record<string,number>)[value(r,53)] || 1):0;
    if(value(r,53)&&value(r,53)!=='0')(p as any).pickoffLabel=value(r,53);
    p.skip=value(r,45)==='0'&&!!rawResult&&rawResult!=='0';
    const to:Record<string,number>={継続:0,残留:0,二進:2,三進:3,本進:4};
    for(let base=1;base<=3;base++) {const status=value(r,36+base);if(!status||status==='0')continue;const dest=to[status];// 「継続」はふつうの状態なので何も入れない。「残留」は打球のときに手で止めた印。アウトは旧Excelの言葉を残す
      // 継続＝その場に留まる（自動で進めない）、残留＝打球で手で止めた
      if(status==='継続'){p.ra[base]={back:true,hold:false} as any;continue}if(status==='残留'){p.ra[base]={back:true,hold:true} as any;continue}p.ra[base]=status.includes('死')||status==='封殺'?{out:true,outLabel:status} as any:dest?{to:dest}:{back:true,label:status} as any;}
    const bst=value(r,40);if(bst==='アウト'||bst==='出塁'||bst==='二進'||bst==='三進'||bst==='本進')p.ra[0]=bst==='アウト'?{out:true}:{to:bst==='出塁'?1:bst==='二進'?2:bst==='三進'?3:4};
    const type=value(r,41);if(type==='牽制'&&!p.pickoff_throw_to)p.pickoff_throw_to=({一塁牽制:1,二塁牽制:2,三塁牽制:3} as Record<string,number>)[value(r,53)]??1;
    if(value(r,30)&&value(r,30)!=='0')p.plan.code=value(r,30);
    if(value(r,31)&&value(r,31)!=='0')p.plan.primary=value(r,31);
    if(value(r,32)&&value(r,32)!=='0')(p as any).planResult=value(r,32);
    {const t=value(r,1).match(/(\d{1,2}:\d{2}:\d{2})/);if(t)p.time=t[1].padStart(8,'0');const d=value(r,1).match(/^\d{4}-\d{2}-\d{2}/);if(d)(p as any).date=d[0];}
    if(value(r,41)==='交代')(p as any).rowType='交代';
    // 打席左右（29列）は打席ごとの記録。打順の欄の左右と違うことがあるので、そのまま持つ
    if(hand(value(r,29)))p.handB=hand(value(r,29));
    // 投手氏名（33列）も行ごとの記録（交代の行より先に投手欄を変えることがある）
    if(value(r,33)&&value(r,33)!=='0')(p as any).pitcherRec=value(r,33);
    // 旧Excelの入力欄の値（投手の球種1〜4、区切りの印、打撃結果２）は取り込んだまま持つ
    {const a=[167,168,169,170].map(c=>value(r,c)==='0'?'':value(r,c)),h=[171,172,173,174].map(c=>value(r,c)==='0'?'':value(r,c));(p as any).pitchTypes=[a,h];}
    (p as any).marks={inning:value(r,19),game:value(r,20)};
    // 守備位置ごとの氏名（175〜181列）は旧VBAのフォーム操作の順で変わることがあるので、元の記録の値を持つ
    (p as any).fieldersRec=Object.fromEntries([3,4,5,6,7,8,9].map(pos=>[pos,value(r,172+pos)==='0'?'':value(r,172+pos)]));
    if(value(r,47)&&value(r,47)!=='0'&&value(r,47)!=='WP'&&value(r,47)!=='PB')(p as any).result2Label=value(r,47);
    if(value(r,190)==='クイック')p.flags.push('クイック');
    if(value(r,191)&&value(r,191)!=='0')(p as any).pickoffStrength=value(r,191);
    if(value(r,55)&&value(r,55)!=='0')(p as any).errorLabel=value(r,55);
    if(value(r,49)&&!['0','ゴロ','フライ','ライナー'].includes(value(r,49)))(p as any).featureLabel=value(r,49);
    if(value(r,54)&&value(r,54)!=='0')(p as any).pickoffDetail=value(r,54);
    for(let t=0;t<2;t++){
      const start=t===0?58:77,handStart=t===0?96:116;
      for(let slot=1;slot<=9;slot++){
        const sourceAfter=value(r,start+(slot-1)*2+1),before=currentSlots[t].get(slot)??'';if(!sourceAfter)continue;const after=safeName(t,sourceAfter);
        const posRaw=value(r,start+(slot-1)*2),entry=lineupByTeam[t].get(after),pos=positions[posRaw]??(Number(posRaw)||entry?.pos||10);
        const was=currentPos[t].get(slot)??lineupByTeam[t].get(before)?.pos;
        if(before&&after!==before)p.subs.push({t:t as 0|1,slot:slot-1,no:entry?.no??playerId(t,sourceAfter),bats:hand(value(r,handStart+(slot-1)*2))??undefined,pos});
        else if(before&&pos!==was)p.subs.push({t:t as 0|1,slot:slot-1,no:null,pos});
        currentPos[t].set(slot,pos);
        // 同じ選手のまま左右だけ書き換えられた（記録の修正）
        const hNow=hand(value(r,handStart+(slot-1)*2)),hWas=currentHand[t].get(slot)??lineupByTeam[t].get(before)?.bat;if(before&&after===before&&hNow&&hWas&&hNow!==hWas)p.subs.push({t:t as 0|1,slot:slot-1,no:null,bats:hNow});if(hNow)currentHand[t].set(slot,hNow);
      }
      const sourceAfter=value(r,t===0?76:95),before=currentSlots[t].get(10)??'';
      if(sourceAfter&&before){const after=safeName(t,sourceAfter)+'#P';if(after!==before){const entry=lineupByTeam[t].get(after)??lineupByTeam[t].get(after.slice(0,-2));p.subs.push({t:t as 0|1,slot:'P',no:entry?.no??playerId(t,sourceAfter),throws:hand(value(r,t===0?114:134))??undefined,pos:1});}}
    }
    capture(r);
    return {seq:number(r,10)||index+1,page:convertSavedPageCoordinates({...p,coords_version:'legacy-excel-v1'})};
  });
  const lineups=lineupByTeam.flatMap((m,t)=>[...m].map(([name,p])=>({team_id:t===0?'away':'home',slot:p.slot,position_id:p.pos,uniform_no:p.no,batting_hand:p.bat,throwing_hand:p.throw,player_snapshot:{id:name.replace(/#P$/,''),name:opts.keepNames?realName.get(name.replace(/#P$/,''))??name:name.replace(/#P$/,''),uniform_no:p.no}})));
  // 旧Excelは行を消したり書き換えたりした跡が残ることがある。各行の「プレイ前の状況」とアプリの計算を比べ、違う行で元の状況に合わせ直す
  {const setups=teamSetupsFromLineup(lineups as any,['away','home'],['','']);const st=initState(setups);
   const noOf=(t:number,nm:string)=>{if(!nm||nm==='0')return null;const e=lineupByTeam[t].get(safeName(t,nm));return e?.no??null};
   plays.forEach((pl,i)=>{const r=data[i];const half=(value(r,12)==='裏'?1:0) as 0|1;
     const bases=[22,24,26].map(c=>noOf(half,value(r,c)));const batNo=noOf(half,value(r,28));const bi=batNo!=null&&st.lu[half].order.includes(batNo)?st.lu[half].order.indexOf(batNo):Math.max(0,(number(r,27)||1)-1);
     const pcNow=st.pcount[(1-half)*1000+st.lu[1-half].P]??0;const want={inn:number(r,11)||st.inn,half,score:[number(r,13),number(r,14)] as [number,number],outs:number(r,17),b:number(r,16),s:number(r,15),bases,bi,pc:Math.max(0,number(r,35)-1)};
     const same=want.inn===st.inn&&want.half===st.half&&want.score[0]===st.score[0]&&want.score[1]===st.score[1]&&want.outs===st.outs&&want.b===st.b&&want.s===st.s&&want.bi===st.bi[half]&&bases.every((x,k)=>x===st.bases[k])&&(number(r,35)<=0||want.pc===pcNow);
     if(!same)pl.page.sync=want;
     applyPage(st,pl.page);});}
  return {game,lineups,plays,masters:{ballTypes:[...new Set(data.map(r=>value(r,45)).filter(x=>x&&x!=='0'))].map(name=>({name,old_excel_label:name}))}};
}
