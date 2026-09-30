import { applyPage, GameState, initState, Page, stateAt, TeamSetup, batterOf, pitcherOf } from './engine';
import { convertSavedPageCoordinates } from './coords';

// Saved-file order from the 191-column values survey, not the input template order.
export const COLUMN191_HEADERS = [
  '試合日時（時刻含む）','Season','Kind','Week','Day','GameNumber','主審','後攻チーム','先攻チーム','プレイの番号','回','表/裏','先攻得点','後攻得点','S','B','アウト','打席の継続','イニング継続','試合継続',
  '一走打順','一走氏名','二走打順','二走氏名','三走打順','三走氏名','打順','打者氏名','打席左右','作戦','作戦２','作戦結果','投手氏名','投手左右','球数','捕手','一走状況','二走状況','三走状況','打者状況','プレイの種類','構え','コースX','コースY','球種','打撃結果','打撃結果２','捕球選手','打球タイプ','打球強度','打球位置X','打球位置Y','牽制の種類','牽制詳細','エラーの種類','タイムの種類','球速',
  ...Array.from({length:9},(_,i)=>`${i+1}番守備`),...Array.from({length:9},(_,i)=>`${i+1}番氏名`),'投手氏名',
  ...Array.from({length:9},(_,i)=>`${i+1}番守備`),...Array.from({length:9},(_,i)=>`${i+1}番氏名`),'投手氏名',
  ...Array.from({length:9},(_,i)=>`${i+1}番○打`).flatMap((h,i)=>[h,`${i+1}番タイプ`]),'投手○投','投手背番号',
  ...Array.from({length:9},(_,i)=>`${i+1}番○打`).flatMap((h,i)=>[h,`${i+1}番タイプ`]),'投手○投','投手背番号','首振り',
  ...Array.from({length:15},(_,i)=>String(i+1)),...Array.from({length:15},(_,i)=>String(i+1)),
  '球種１','球種２','球種３','球種４','球種１','球種２','球種３','球種４','3','4','5','6','7','8','9','記録者','攻撃チーム','勝利チーム','得点チーム','投球数／打席','タイミング','リアクション','打者タイプ','クイック','牽制の強さ',
] as const;

export type GameExportInfo = { dateTime: string; season: string; kind: string; week: string; day: string; gameNumber: number; homeTeam: string; awayTeam: string; umpire?: string; scorer?: string; startPlayNo?: number; pitcherNames: [string,string]; catcherNames: [string,string]; lineupNames: [string[],string[]]; lineupPositions: [string[],string[]]; lineupNos?: [number[],number[]]; playerNames?: [Record<string,string>,Record<string,string>]; hands: [string[],string[]]; pitcherHands: [string,string]; };
export type PlayExportInfo = { result?: string; result2?: string; pitchType?: string; pitchSpeed?: number; pitchCount?:number; course?: [number,number]; ballType?: string; ballRank?: string; ballXY?: [number,number]; featureName?: string; pitchSetup?: number; runnerStatus?: [string,string,string]; batterStatus?: string; playType?: string; catchFielder?: string; operation?: string; operationDetail?: string; operationResult?: string; pickoffDetail?: string; pickoffStrength?: string; quick?: string; handB?:string; skipPa?: boolean; };

const posCode = (n: number) => n === 10 ? 'D' : n >= 1 && n <= 9 ? String(n) : '';
export function export191Row(st: GameState, page: Page, info: GameExportInfo, playNo: number, play: PlayExportInfo = {}): (string|number)[] {
  const row: (string|number)[] = Array(191).fill('');
  const put = (col: number, val: string|number|undefined|null) => { row[col-1] = val ?? ''; };
  const side = st.half, batNo = st.bi[side], batter = batterOf(st), pitcher = pitcherOf(st);
  const nameFor=(team:number,no:number|null)=>no==null?'':info.playerNames?.[team]?.[String(no)]??info.lineupNames[team][info.lineupNos?.[team].indexOf(no)??-1]??String(no);
  put(1,info.dateTime);put(2,info.season);put(3,info.kind);put(4,info.week);put(5,info.day);put(6,info.gameNumber);put(7,info.umpire);
  put(8,info.homeTeam);put(9,info.awayTeam);put(10,playNo);put(11,st.inn);put(12,side===0?'表':'裏');put(13,st.score[0]);put(14,st.score[1]);put(15,st.s);put(16,st.b);put(17,st.outs);
  put(18,play.skipPa||!!page.res?.kind&&(['out','sac','sf','io',1,2,3,4,'IBB','hbp'].includes(page.res.kind as never)||page.res.kind==='B'&&st.b>=3||page.res.kind==='S'&&st.s>=2)?'打席完了':'打席継続');put(19,st.inn===1&&playNo===(info.startPlayNo??1)?'イニング開始':'イニング継続');put(20,playNo===(info.startPlayNo??1)?'試合開始':play.playType==='試合終了'?'試合終了':'試合継続');
  st.bases.forEach((id,i)=>{if(id==null){put(21+i*2,0);put(22+i*2,0);put(37+i,0);return}const slot=info.lineupNos?.[side].indexOf(Number(id))??-1;put(21+i*2,slot>=0?(st.subHalf[side].includes(slot)?'R':slot+1):'R');put(22+i*2,nameFor(side,id));put(37+i,play.runnerStatus?.[i] || '継続');});
  put(27,st.subHalf[side].includes(batNo)?'H':batNo+1);put(28,nameFor(side,batter));put(29,st.lu[side].bats[batNo]==='両'?play.handB??info.hands[side][batNo]:st.lu[side].bats[batNo]);put(30,play.operation??0);put(31,play.operationDetail??0);put(32,play.operationResult??0);put(33,nameFor(1-side,pitcher));put(34,st.lu[1-side].throws);put(35,play.pitchCount??st.pcount[pitcher]??0);const catcherSlot=st.lu[1-side].pos.indexOf(2);put(36,catcherSlot>=0?nameFor(1-side,st.lu[1-side].order[catcherSlot]):0);put(40,play.batterStatus??0);put(41,play.playType || '投球');put(42,play.pitchSetup??0);put(43,play.course?.[0]??0);put(44,play.course?.[1]??0);put(45,play.pitchType??0);put(46,play.result??0);put(47,play.result2??0);put(48,play.catchFielder??0);put(49,play.featureName??0);put(50,play.ballRank??0);put(51,play.ballXY?.[0]??0);put(52,play.ballXY?.[1]??0);put(53,page.pickoff_throw_to?`${page.pickoff_throw_to}塁牽制`:0);put(54,play.pickoffDetail??0);put(55,0);put(56,0);put(57,play.pitchSpeed??0);
  for(let team=0;team<2;team++){const base=team===0?58:77;for(let slot=0;slot<9;slot++){put(base+slot*2,posCode(st.lu[team].pos[slot]));put(base+slot*2+1,nameFor(team,st.lu[team].order[slot]));}put(team===0?76:95,nameFor(team,st.lu[team].P));}
  for(let team=0;team<2;team++){const start=team===0?96:116;for(let slot=0;slot<9;slot++){put(start+slot*2+1,st.lu[team].bats[slot]);put(start+slot*2+2,0);}put(team===0?114:134,st.lu[team].throws);}
  for(let i=0;i<15;i++){put(137+i,st.line[0][i]??'');put(152+i,st.line[1][i]??'');}
  // Columns 175-181 are current defending 1B through RF player names.
  for(let pos=3;pos<=9;pos++){const slot=st.lu[1-side].pos.findIndex(v=>v===pos);put(172+pos,slot>=0?nameFor(1-side,st.lu[1-side].order[slot]):'');}
  put(182,info.scorer);put(183,side===0?info.awayTeam:info.homeTeam);put(190,play.quick??0);put(191,play.pickoffStrength??0);
  if(play.skipPa){ put(41,'投球');put(45,'0');put(43,0);put(44,0);put(46,play.result);put(40,play.batterStatus); }
  return row;
}
export function export191(rows: (string|number)[][]): string { return [COLUMN191_HEADERS.join('\t'),...rows.map(row=>COLUMN191_HEADERS.map((_,i)=>String(row[i]??'')).join('\t'))].join('\n'); }
export function export191Csv(rows:(string|number)[][]):string {
  const cell=(value:unknown)=>{const s=String(value??'');return /[",\r\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s};
  return `\uFEFF${[COLUMN191_HEADERS,...rows].map(row=>Array.from({length:191},(_,i)=>cell(row[i])).join(',')).join('\r\n')}`;
}

export type Export191Game = GameExportInfo & { game_date?: string; game_time?: string; home_name?: string; away_name?: string; home_team_id?: string; away_team_id?: string; season?: string; kind?: string; week?: string; day?: string; game_number?: number; umpire?: string };
export type Export191Lineup = { team_id: string; slot: number; position_id: number; uniform_no?: string | number | null; batting_hand?: string | null; throwing_hand?: string | null; player_snapshot?: { id?: string; name?: string; uniform_no?: string | number; show_index?: number; bat_hand?: string; throw_hand?: string } | null };
export type Export191Play = { seq: number; page: Page };
export type Export191Masters = { ballTypes?: Array<{ name: string; old_excel_label?: string | null }>; results?: Array<{ id?: string; name?: string; old_excel_label?: string | null }>; plans?: Array<{ id?: string; name?: string; old_excel_label?: string | null }>; players?: Array<{team_id?:string;name?:string;uniform_no?:string|number;show_index?:string|number}> };

/** Build the saved-file-order rows from the local scoring model. */
export function export191Game(game: Export191Game, lineup: Export191Lineup[], plays: Export191Play[], masters: Export191Masters = {}): (string|number)[][] {
  const ids: [string,string] = [game.away_team_id ?? 'away', game.home_team_id ?? 'home'];
  const teams: [string,string] = [game.away_name ?? game.awayTeam ?? '', game.home_name ?? game.homeTeam ?? ''];
  const rows = lineup.map(item => ({...item, team_id: item.team_id === ids[0] ? ids[0] : ids[1]}));
  const name = (r: Export191Lineup | undefined) => r?.player_snapshot?.name ?? '';
  const no = (r: Export191Lineup | undefined, slot: number) => Number(r?.uniform_no ?? r?.player_snapshot?.uniform_no ?? r?.player_snapshot?.show_index ?? slot + 1);
  const slots = (team: string) => Array.from({length:9},(_,i)=>rows.find(r=>r.team_id===team&&r.slot===i+1));
  const pitcher = (team: string) => rows.find(r=>r.team_id===team&&r.slot===10) ?? rows.find(r=>r.team_id===team&&r.position_id===1);
  const setup: TeamSetup[] = ids.map((id,i)=>({name:teams[i],order:slots(id).map((r,s)=>no(r,s)),pos:slots(id).map(r=>r?.position_id??10),bats:slots(id).map(r=>r?.batting_hand==='L'?'左':r?.batting_hand==='S'?'両':'右'),P:no(pitcher(id),0),throws:pitcher(id)?.throwing_hand==='L'?'左':'右'}));
  const info: GameExportInfo = {
    dateTime: game.dateTime ?? `${game.game_date ?? ''}${game.game_time ? ` ${game.game_time}` : ''}`,
    season: game.season ?? '', kind: game.kind ?? '', week: String(game.week ?? ''), day: String(game.day ?? ''), gameNumber: Number(game.game_number ?? game.gameNumber ?? 0),
    homeTeam: teams[1], awayTeam: teams[0], umpire: game.umpire,
    pitcherNames: [name(pitcher(ids[0])),name(pitcher(ids[1]))],
    catcherNames: ids.map(id=>name(rows.find(r=>r.team_id===id&&r.position_id===2))) as [string,string],
    lineupNames: ids.map(id=>slots(id).map(name)) as [string[],string[]],
    lineupPositions: ids.map(id=>slots(id).map(r=>String(r?.position_id ?? 0))) as [string[],string[]],
    lineupNos: ids.map(id=>slots(id).map((r,s)=>no(r,s))) as [number[],number[]],
    playerNames: ids.map((id,t)=>Object.fromEntries([...rows.filter(r=>r.team_id===id).map(r=>[String(no(r,(r.slot??1)-1)),name(r)] as const),...(masters.players??[]).filter(p=>p.team_id===id&&p.name).map(p=>[String(Number(p.uniform_no??p.show_index)),String(p.name)] as const)])) as [Record<string,string>,Record<string,string>],
    hands: ids.map(id=>slots(id).map(r=>r?.batting_hand==='L'?'左':'右')) as [string[],string[]],
    pitcherHands: ids.map(id=>pitcher(id)?.throwing_hand==='L'?'左':'右') as [string,string],
  };
  const clean = plays;
  return clean.map((item,index)=>{
    const before=stateAt(index,clean.map(x=>x.page),setup,true);
    const p=convertSavedPageCoordinates(item.page);
    const result = p.res ? masters.results?.find(x=>x.id===String(p.res?.kind)||x.name===p.res?.label)?.old_excel_label ?? p.res.label : undefined;
    const pitchType = p.pitch_type ? masters.ballTypes?.find(x=>x.name===p.pitch_type)?.old_excel_label ?? p.pitch_type : undefined;
    const planNames=Object.values(p.plan??{}).filter(Boolean).map(v=>masters.plans?.find(x=>x.id===String(v)||x.name===String(v))?.old_excel_label??String(v));
    const defender=before.lu[1-before.half];
    const fielder=(f: number|{pos:number;err?:string})=>typeof f==='number'? defender.order[defender.pos.indexOf(f)] : defender.order[defender.pos.indexOf(f.pos)];
    const play: PlayExportInfo={result,result2:p.flags.find(x=>x==='WP'||x==='PB'),pitchType,pitchSpeed:Number(p.ball_speed)||0,course:p.course??undefined,ballType:undefined,ballRank:p.rank??undefined,ballXY:p.batted_ball?[p.batted_ball.x,p.batted_ball.y]:undefined,featureName:({1:'ゴロ',2:'フライ',3:'ライナー'} as Record<number,string>)[p.feature],pitchSetup:p.catcher_mitt_position,playType:p.pickoff_throw_to?'牽制':p.subs.length&&!p.res?'交代':'投球',catchFielder:p.catch_fielder.map(f=>String(fielder(f)??'')).filter(Boolean).join('、'),operation:planNames[0],operationDetail:planNames[1],handB:p.handB??undefined,skipPa:p.skip,runnerStatus:[1,2,3].map(base=>p.ra[base]?.out?'アウト':p.ra[base]?.to===1?'一進':p.ra[base]?.to===2?'二進':p.ra[base]?.to===3?'三進':p.ra[base]?.to===4?'本進':p.ra[base]?.back?'残留':undefined) as [string,string,string],batterStatus:p.ra[0]?.out?'アウト':p.ra[0]?.to===1?'出塁':p.ra[0]?.to===2?'二進':p.ra[0]?.to===3?'三進':p.ra[0]?.to===4?'本進':undefined,quick:undefined};
    const row=export191Row(before,p,info,item.seq,play);
    applyPage(before,p);
    return row;
  });
}
