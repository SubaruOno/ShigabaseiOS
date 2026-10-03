import { applyPage, applyPre, GameState, initState, Page, stateAt, TeamSetup, batterOf, pitcherOf, moves, Hand } from './engine';
import { convertSavedPageCoordinates } from './coords';
import { resultWords } from './to-pitches';

// Saved-file order from the 191-column values survey, not the input template order.
export const COLUMN191_HEADERS = [
  '試合日時（時刻含む）','Season','Kind','Week','Day','GameNumber','主審','後攻チーム','先攻チーム','プレイの番号','回','表/裏','先攻得点','後攻得点','S','B','アウト','打席の継続','イニング継続','試合継続',
  '一走打順','一走氏名','二走打順','二走氏名','三走打順','三走氏名','打順','打者氏名','打席左右','作戦','作戦２','作戦結果','投手氏名','投手左右','球数','捕手','一走状況','二走状況','三走状況','打者状況','プレイの種類','構え','コースX','コースY','球種','打撃結果','打撃結果２','捕球選手','打球タイプ','打球強度','打球位置X','打球位置Y','牽制の種類','牽制詳細','エラーの種類','タイムの種類','球速',
  ...Array.from({length:9},(_,i)=>[`${i+1}番守備`,`${i+1}番氏名`]).flat(),'投手氏名',
  ...Array.from({length:9},(_,i)=>[`${i+1}番守備`,`${i+1}番氏名`]).flat(),'投手氏名',
  ...Array.from({length:9},(_,i)=>`${i+1}番○打`).flatMap((h,i)=>[h,`${i+1}番タイプ`]),'投手○投','投手背番号',
  ...Array.from({length:9},(_,i)=>`${i+1}番○打`).flatMap((h,i)=>[h,`${i+1}番タイプ`]),'投手○投','投手背番号','首振り',
  ...Array.from({length:15},(_,i)=>String(i+1)),...Array.from({length:15},(_,i)=>String(i+1)),
  '球種１','球種２','球種３','球種４','球種１','球種２','球種３','球種４','3','4','5','6','7','8','9','記録者','攻撃チーム','勝利チーム','得点チーム','投球数／打席','タイミング','リアクション','打者タイプ','クイック','牽制の強さ',
] as const;

export type GameExportInfo = { dateTime: string; season: string; kind: string; week: string; day: string; gameNumber: number; homeTeam: string; awayTeam: string; umpire?: string; scorer?: string; startPlayNo?: number; pitcherNames: [string,string]; catcherNames: [string,string]; lineupNames: [string[],string[]]; lineupPositions: [string[],string[]]; lineupNos?: [number[],number[]]; playerNames?: [Record<string,string>,Record<string,string>]; hands: [string[],string[]]; pitcherHands: [string,string]; };
export type PlayExportInfo = { pitchTypes?: string[][]; fielders?: Record<number,string>; lineupState?: GameState; errorLabel?: string; dateTime?: string; paEnd?: boolean; inning?: string; gameMark?: string; result?: string; result2?: string; pitchType?: string; pitchSpeed?: number; pitchCount?:number; course?: [number,number]; ballType?: string; ballRank?: string; ballXY?: [number,number]; featureName?: string; pitchSetup?: number; runnerStatus?: [string,string,string]; batterStatus?: string; playType?: string; catchFielder?: string; operation?: string; operationDetail?: string; operationResult?: string; pickoffDetail?: string; pickoffStrength?: string; quick?: string; handB?:string; skipPa?: boolean; };

// 守備の印：1〜9、D（DH）、H（代打で守備未定）、R（代走で守備未定）
const posCode = (n: number) => n === 10 ? 'D' : n === 11 ? 'H' : n === 12 ? 'R' : n >= 1 && n <= 9 ? String(n) : '';
export function export191Row(st: GameState, page: Page, info: GameExportInfo, playNo: number, play: PlayExportInfo = {}): (string|number)[] {
  const row: (string|number)[] = Array(191).fill('');
  const put = (col: number, val: string|number|undefined|null) => { row[col-1] = val ?? ''; };
  const side = st.half, batNo = st.bi[side], batter = batterOf(st), pitcher = pitcherOf(st);
  const nameFor=(team:number,no:number|null)=>no==null?'':info.playerNames?.[team]?.[String(no)]??info.lineupNames[team][info.lineupNos?.[team].indexOf(no)??-1]??String(no);
  put(1,play.dateTime??info.dateTime);put(2,info.season);put(3,info.kind);put(4,info.week);put(5,info.day);put(6,info.gameNumber);put(7,info.umpire);
  put(8,info.homeTeam);put(9,info.awayTeam);put(10,playNo);put(11,st.inn);put(12,side===0?'表':'裏');put(13,st.score[0]);put(14,st.score[1]);put(15,st.s);put(16,st.b);put(17,st.outs);
  // 打席・イニング・試合の区切りは、この行を入れたあとの状況と比べて決める（export191Game が渡す）
  put(18,play.paEnd?'打席完了':'打席継続');put(19,play.inning??'イニング継続');put(20,play.gameMark??'試合継続');
  st.bases.forEach((id,i)=>{if(id==null){put(21+i*2,0);put(22+i*2,0);put(37+i,0);return}const slot=st.lu[side].order.indexOf(Number(id));put(21+i*2,slot>=0?(st.pr?.[side]?.includes(slot)?'R':slot+1):'R');put(22+i*2,nameFor(side,id));put(37+i,play.runnerStatus?.[i] || '継続');});
  put(27,st.ph?.[side]?.includes(batNo)?'H':batNo+1);put(28,nameFor(side,batter));put(29,page.handB??(st.lu[side].bats[batNo]==='両'?play.handB??info.hands[side][batNo]:st.lu[side].bats[batNo]));put(30,play.operation??0);put(31,play.operationDetail??0);put(32,play.operationResult??0);put(33,(page as any).pitcherRec??nameFor(1-side,pitcher));put(34,st.lu[1-side].throws);// 球数は、それまでの球数＋1（旧Excelは牽制・交代の行でも「次の球の番号」を入れる）
  const thisPitch=1;put(35,play.pitchCount??(st.pcount[(1-side)*1000+pitcher]??0)+thisPitch);const catcherSlot=st.lu[1-side].pos.indexOf(2);put(36,catcherSlot>=0?nameFor(1-side,st.lu[1-side].order[catcherSlot]):'');put(40,play.batterStatus??0);put(41,play.playType || '投球');put(42,play.pitchSetup??0);// 座標は旧Excelと同じく小数2桁まで
  const r2=(v:number|undefined)=>v==null?0:Math.round(v*100)/100;put(43,r2(play.course?.[0]));put(44,r2(play.course?.[1]));put(45,play.pitchType??0);put(46,play.result??0);put(47,play.result2??0);put(48,play.catchFielder??0);put(49,play.featureName??0);put(50,play.ballRank??0);put(51,r2(play.ballXY?.[0]));put(52,r2(play.ballXY?.[1]));put(53,(page as any).pickoffLabel??(page.pickoff_throw_to?`${['','一','二','三'][page.pickoff_throw_to]}塁牽制`:0));put(54,play.pickoffDetail??0);put(55,play.errorLabel??0);put(56,0);put(57,play.pitchSpeed??0);
  // 旧Excelの「交代」の行は、打順・守備の欄（58〜135列）だけ交代後の並びを書く
  const LU=(play.lineupState??st).lu;
  for(let team=0;team<2;team++){const base=team===0?58:77;for(let slot=0;slot<9;slot++){put(base+slot*2,posCode(LU[team].pos[slot]));put(base+slot*2+1,nameFor(team,LU[team].order[slot]));}put(team===0?76:95,nameFor(team,LU[team].P));}
  for(let team=0;team<2;team++){const start=team===0?96:116;// 各打順は「○打」（左右）と「タイプ」（空）の2列。1番の○打が96列目（後攻は116列目）
    for(let slot=0;slot<9;slot++){put(start+slot*2,LU[team].bats[slot]);put(start+slot*2+1,'');}put(team===0?114:134,LU[team].throws);}
  // スコアボードは、終わった表・裏だけ書く（進行中の回は空）
  const done=(t:number,i:number)=>i+1<st.inn||(i+1===st.inn&&t<side);const cell=(t:number,i:number)=>done(t,i)?st.line[t][i]??0:(i+1===st.inn&&t===side&&(st.line[t][i]??0)>0?st.line[t][i]:'');
  for(let i=0;i<15;i++){put(137+i,cell(0,i));put(152+i,cell(1,i));}
  // Columns 175-181 are current defending 1B through RF player names.
  for(let pos=3;pos<=9;pos++){if(play.fielders){put(172+pos,play.fielders[pos]??'');continue}const slot=st.lu[1-side].pos.findIndex(v=>v===pos);put(172+pos,slot>=0?nameFor(1-side,st.lu[1-side].order[slot]):'');}
  put(182,info.scorer);for(let k=0;k<4;k++){put(167+k,play.pitchTypes?.[0]?.[k]||'');put(171+k,play.pitchTypes?.[1]?.[k]||'');}put(190,page.flags?.includes('クイック')?'クイック':0);put(136,0);
  // 取り込んだ試合は、フォームに表示されていた欄を元の記録のまま書く
  const rec=(page as any).rec;if(rec){for(const [c,v] of Object.entries(rec.disp??{}))put(Number(c),v as string);put(34,rec.c34);put(36,rec.c36);put(136,rec.c136===''?0:rec.c136);rec.hands.forEach((v:string,k:number)=>put(96+k,v));}put(191,'');put(191,play.pickoffStrength??'');
  if(play.skipPa){ put(41,'投球');put(45,'0');put(43,0);put(44,0);put(46,play.result);put(40,play.batterStatus); }
  return row;
}
export function export191(rows: (string|number)[][]): string { return [COLUMN191_HEADERS.join('\t'),...rows.map(row=>COLUMN191_HEADERS.map((_,i)=>String(row[i]??'')).join('\t'))].join('\n'); }
// 旧Excelの保存ファイルの1行目（列のまとまりの見出し）。列番号は1始まり
export const COLUMN191_GROUPS: [number,string][] = [[1,'基礎情報'],[10,'プレイ前の状況'],[18,'プレイ後のゲームの切れ目'],[21,'プレイ前の走者および打者状況'],[30,'空白列（後の追加のため）'],[37,'走者のプレイ（記入事項）'],[58,'出場メンバー（先攻）'],[77,'出場メンバー（後攻）'],[96,'出場メンバー（先攻）'],[116,'出場メンバー（後攻）'],[137,'ランニングスコア　表'],[152,'ランニングスコア　裏'],[167,'PitcherResult'],[175,'守備位置']];
/** 旧VBA（試合ファイル作成.bas）と同じファイル名：試合記録（季節種別 週-日-第何試合 先攻vs後攻） */
export function legacyFileName(g:{season?:string;kind?:string;week?:string|number|null;day?:string|number|null;game_number?:string|number|null;away_name?:string;home_name?:string}):string{
  const v=(x:unknown)=>x==null||x===0||x==='0'?'':String(x);
  return `試合記録（${v(g.season)}${v(g.kind)}${v(g.week)}-${v(g.day)}-${v(g.game_number)}${v(g.away_name)}vs${v(g.home_name)}）.xlsx`;
}
/** 旧Excelと同じ形（1行目にまとまりの見出し、2行目に列名、シート名「試合記録」）の表を作る */
export function export191Sheet(rows:(string|number)[][]):(string|number|null)[][]{
  const g=Array<string|null>(191).fill(null);for(const [c,t] of COLUMN191_GROUPS)g[c-1]=t;
  return [g,[...COLUMN191_HEADERS],...rows.map(r=>Array.from({length:191},(_,i)=>r[i]??''))];
}
export function export191Csv(rows:(string|number)[][]):string {
  const cell=(value:unknown)=>{const s=String(value??'');return /[",\r\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s};
  return `\uFEFF${[COLUMN191_HEADERS,...rows].map(row=>Array.from({length:191},(_,i)=>cell(row[i])).join(',')).join('\r\n')}`;
}

export type Export191Game = GameExportInfo & { game_date?: string; game_time?: string; home_name?: string; away_name?: string; home_team_id?: string; away_team_id?: string; season?: string; kind?: string; week?: string; day?: string; game_number?: number; umpire?: string };
export type Export191Lineup = { team_id: string; slot: number; position_id: number; uniform_no?: string | number | null; batting_hand?: string | null; throwing_hand?: string | null; player_snapshot?: { id?: string; name?: string; uniform_no?: string | number; show_index?: number; bat_hand?: string; throw_hand?: string } | null };
export type Export191Play = { seq: number; page: Page };
export type Export191Masters = { ballTypes?: Array<{ name: string; old_excel_label?: string | null }>; results?: Array<{ id?: string; name?: string; old_excel_label?: string | null }>; plans?: Array<{ id?: string; name?: string; old_excel_label?: string | null }>; players?: Array<{team_id?:string;name?:string;uniform_no?:string|number;show_index?:string|number}> };

// 打球が飛んだ結果（このときの走者アウトは封殺など）
const inPlayKind=(k:unknown)=>typeof k==='number'||['out','sac','sf','e','fc'].includes(String(k));
// 利き手は L/R/S（マスタ）でも 左/右/両（旧Excel）でも受け取る
const handJa=(h?:string|null):Hand=>h==='L'||h==='左'?'左':h==='S'||h==='両'?'両':'右';
/** Build the saved-file-order rows from the local scoring model. */
// 191列の1行になるページか（結果・牽制・打席スキップ・交代・タイブレークのどれかがある）。デバックチェックで行からページへ戻るときにも使う
export const exportsRow = (page: unknown) => { const p = page as any; return !!(p?.rec||p?.res||p?.pickoff_throw_to||p?.skip||p?.subs?.length||p?.tb||p?.rowType||p?.sync); };
export function export191Game(game: Export191Game, lineup: Export191Lineup[], plays: Export191Play[], masters: Export191Masters = {}): (string|number)[][] {
  const ids: [string,string] = [game.away_team_id ?? 'away', game.home_team_id ?? 'home'];
  const teams: [string,string] = [game.away_name ?? game.awayTeam ?? '', game.home_name ?? game.homeTeam ?? ''];
  const rows = lineup.map(item => ({...item, team_id: item.team_id === ids[0] ? ids[0] : ids[1]}));
  const name = (r: Export191Lineup | undefined) => r?.player_snapshot?.name ?? '';
  const no = (r: Export191Lineup | undefined, slot: number) => Number(r?.uniform_no ?? r?.player_snapshot?.uniform_no ?? r?.player_snapshot?.show_index ?? slot + 1);
  const slots = (team: string) => Array.from({length:9},(_,i)=>rows.find(r=>r.team_id===team&&r.slot===i+1));
  const pitcher = (team: string) => rows.find(r=>r.team_id===team&&r.slot===10) ?? rows.find(r=>r.team_id===team&&r.position_id===1);
  const setup: TeamSetup[] = ids.map((id,i)=>({name:teams[i],order:slots(id).map((r,s)=>no(r,s)),pos:slots(id).map(r=>r?.position_id??10),bats:slots(id).map(r=>handJa(r?.batting_hand)),P:no(pitcher(id),0),throws:handJa(pitcher(id)?.throwing_hand)==='左'?'左':'右'}));
  const info: GameExportInfo = {
    dateTime: game.dateTime ?? `${game.game_date ?? ''}${game.game_time ? ` ${game.game_time}` : ''}`,
    season: game.season ?? '', kind: game.kind ?? '', week: String(game.week ?? ''), day: String(game.day ?? ''), gameNumber: (game.game_number ?? game.gameNumber ?? '') as any,
    homeTeam: teams[1], awayTeam: teams[0], umpire: game.umpire, scorer: (game as any).scorer,
    pitcherNames: [name(pitcher(ids[0])),name(pitcher(ids[1]))],
    catcherNames: ids.map(id=>name(rows.find(r=>r.team_id===id&&r.position_id===2))) as [string,string],
    lineupNames: ids.map(id=>slots(id).map(name)) as [string[],string[]],
    lineupPositions: ids.map(id=>slots(id).map(r=>String(r?.position_id ?? 0))) as [string[],string[]],
    lineupNos: ids.map(id=>slots(id).map((r,s)=>no(r,s))) as [number[],number[]],
    playerNames: ids.map((id,t)=>Object.fromEntries([...rows.filter(r=>r.team_id===id).map(r=>[String(no(r,(r.slot??1)-1)),name(r)] as const),...(masters.players??[]).filter(p=>p.team_id===id&&p.name).map(p=>[String(Number(p.uniform_no??p.show_index)),String(p.name)] as const)])) as [Record<string,string>,Record<string,string>],
    hands: ids.map(id=>slots(id).map(r=>handJa(r?.batting_hand))) as [string[],string[]],
    pitcherHands: ids.map(id=>handJa(pitcher(id)?.throwing_hand)==='左'?'左':'右') as [string,string],
  };
  // 結果・牽制・打席スキップ・交代・タイブレークのどれもない空のページ（メモだけ等）は行にしない
  const clean = plays.filter(x=>exportsRow(x.page));
  // 旧VBA（GameData.frm）の守備位置ごとの氏名（175〜181列）の書き方を再現する：
  // 試合開始・攻守交代の最初の行・交代の行でだけ、守備側の打順を1番から見て（D・H・R以外）入れ物に書き、ほかの行は前の行を引き継ぐ。
  // 書くたびに入れ物を空にする（旧VBAはフォームを閉じるたびに入れ物が空になる）。
  let fielders:Record<number,string>={};let shown:Record<number,string>={};let prevInning='';let prevHalfKey='';let pitchTypes:string[][]=[['','','',''],['','','','']];
  return clean.map((item,index)=>{
    // 「交代」の行は、旧Excelでは交代前の選手のまま書き、次の行から新しい選手になる
    const subRow=(item.page as any).rowType==='交代';
    const before=stateAt(index,clean.map(x=>x.page),setup,!subRow);
    // 交代の行でも、元データの合わせ直しは当てる（交代そのものは次の行から）
    if(subRow&&(item.page as any).sync)applyPre(before,{...item.page,subs:[],tb:null} as Page);
    const p=convertSavedPageCoordinates(item.page);
    // 打撃結果は旧Excelの言葉で書く（カウントで決まる「見逃し三振」「四球」なども含め、投球データと同じ変換を使う）
    // 旧Excel：ボークの行は打撃結果・球種とも0、走塁妨害は打撃結果0で打撃結果２に「走塁妨害」
    const legacyBlank = p.res?.kind==='BK'||p.res?.label==='走塁妨害';
    const result = legacyBlank ? undefined : p.res ? resultWords(p,before) ?? masters.results?.find(x=>x.id===String(p.res?.kind)||x.name===p.res?.label)?.old_excel_label ?? p.res.label : undefined;
    const pitchType = p.res?.kind==='BK' ? undefined : p.pitch_type ? masters.ballTypes?.find(x=>x.name===p.pitch_type)?.old_excel_label ?? p.pitch_type : undefined;
    const planNames=Object.values(p.plan??{}).filter(Boolean).map(v=>masters.plans?.find(x=>x.id===String(v)||x.name===String(v))?.old_excel_label??String(v));
    const defender=before.lu[1-before.half];
    const fielder=(f: number|{pos:number;err?:string})=>typeof f==='number'? defender.order[defender.pos.indexOf(f)] : defender.order[defender.pos.indexOf(f.pos)];
    // 走者の動きは、結果から自動で決まる分も含めて書く（旧マクロは「本進」の数を打点として数える）
    const mv=moves(before,p) as Record<number,{to?:number;out?:boolean}>;
    const play: PlayExportInfo={result,// 画面のボタン名（半角）を旧Excelの言葉にそろえる
    result2:p.flags.map(x=>x==='ﾜｲﾙﾄﾞﾋﾟｯﾁ'||x==='ワイルドピッチ'?'WP':x==='ﾊﾟｽﾎﾞｰﾙ'||x==='パスボール'?'PB':x).find(x=>x==='WP'||x==='PB')??(p.res?.label==='走塁妨害'?'走塁妨害':(p as any).result2Label),pitchType,pitchSpeed:Number(p.ball_speed)||0,course:p.course??undefined,ballType:undefined,// 強さは旧Excelと同じ A・B・C（X は記録なし）。古いページの数字（1〜3）も読み替える
    ballRank:({'1':'A','2':'B','3':'C','A':'A','B':'B','C':'C'} as Record<string,string>)[String(p.rank??'')]??undefined,ballXY:p.batted_ball?[p.batted_ball.x,p.batted_ball.y]:undefined,featureName:(p as any).featureLabel??({1:'ゴロ',2:'フライ',3:'ライナー'} as Record<number,string>)[p.feature],pitchSetup:p.catcher_mitt_position,playType:p.pickoff_throw_to?'牽制':(p as any).rowType??(p.res?.kind==='BK'?'ボーク':p.subs.length&&!p.res?'交代':'投球'),// 旧Excelの捕球選手は、最初に捕った野手の守備番号（1〜9）
    catchFielder:p.catch_fielder.length?String(typeof p.catch_fielder[0]==='number'?p.catch_fielder[0]:p.catch_fielder[0].pos):'0',// エラーの種類は旧Excelと同じ「守備番号＋種類」（例：6ファンブル）
    errorLabel:(p as any).errorLabel??(()=>{const e=p.catch_fielder.find(c=>typeof c==='object'&&c.err) as {pos:number;err?:string}|undefined;return e?`${e.pos}${String(e.err).split(/[、,]/)[0]}`:undefined})(),operation:planNames[0],operationResult:(p as any).planResult==='結果'?resultWords(p,before)??undefined:(p as any).planResult,dateTime:p.time&&info.dateTime?`${(p as any).date??String(info.dateTime).slice(0,10)} ${p.time}`:undefined,pickoffDetail:(p as any).pickoffDetail,pickoffStrength:(p as any).pickoffStrength,operationDetail:planNames[1],handB:p.handB??undefined,skipPa:p.skip,runnerStatus:[1,2,3].map(base=>{const m=mv[base];const lb=(p.ra[base] as any)?.label;const hold=(p.ra[base] as any)?.hold===true;return before.bases[base-1]==null?undefined:lb?lb:hold?'残留':m?.out?(p.ra[base] as any)?.outLabel??(p.pickoff_throw_to?'投手牽制死':(p.ra[base] as any)?.steal||!inPlayKind(p.res?.kind)?'盗塁死':'封殺'):m?.to===2?'二進':m?.to===3?'三進':(m?.to??0)>=4?'本進':(p.ra[base] as any)?.back&&((p.ra[base] as any).hold??['out','sac','sf','e','fc',1,2,3].includes(p.res?.kind as never))?'残留':undefined}) as [string,string,string],batterStatus:(p as any).batterLabel??(mv[0]?.out?'アウト':mv[0]?.to===1?'出塁':mv[0]?.to===2?'二進':mv[0]?.to===3?'三進':(mv[0]?.to??0)>=4?'本進':undefined),quick:undefined};
    const after=structuredClone(before);applyPage(after,p);
    play.paEnd=after.bi[before.half]!==before.bi[before.half];
    const prevBefore=index>0?stateAt(index-1,clean.map(x=>x.page),setup,true):null;const startHalf=!prevBefore||prevBefore.half!==before.half||prevBefore.inn!==before.inn;
    play.inning=after.half!==before.half||after.inn!==before.inn?'イニング完了':startHalf?'イニング開始':'イニング継続';
    // 試合終了は、試合が終わっている（入力中・中断でない）ときの最後の行だけ
    const ended=!(game as any).status||(game as any).status==='completed';
    play.gameMark=index===0?'試合開始':index===clean.length-1&&ended?'試合終了':'試合継続';
    if(subRow)play.lineupState=stateAt(index,clean.map(x=>x.page),setup,true);
    {const fill=(stt:GameState)=>{const t=1-stt.half,lu=stt.lu[t];fielders={};lu.order.forEach((no,slot)=>{const pos=lu.pos[slot];if(pos>=1&&pos<=9)fielders[pos]=info.playerNames?.[t]?.[String(no)]??info.lineupNames[t][info.lineupNos?.[t].indexOf(no)??-1]??String(no)});shown={...fielders}};
     // 新しい行を画面に用意したとき（試合開始・前の行がイニング完了）に、その行の交代を入れる前の並びで書く
     if(index===0||prevInning==='イニング完了'||((p as any).sync&&prevHalfKey!==`${before.inn}-${before.half}`))fill(before);prevHalfKey=`${before.inn}-${before.half}`;
     // 日をまたいで（翌日にフォームを開き直して）続けた場合、前日の最後の行が交代の行なら、その行を交代後の並びで書き直している
     const nextDate=(clean[index+1]?.page as any)?.date;if(subRow&&nextDate&&(p as any).date&&nextDate!==(p as any).date)fill(play.lineupState!);
     // 取り込んだ試合は、元の記録の値を使う（アプリで入れた試合は上の決まりで作る）
     const rec=(p as any).fieldersRec;if(rec)shown=rec;
     play.fielders=shown;prevInning=play.inning??'';
     // 投手の球種1〜4（旧Excelの入力欄）は、入れた行から先へ引き継ぐ
     const pt=(p as any).pitchTypes as string[][]|undefined;if(pt)pitchTypes=pt;play.pitchTypes=pitchTypes;
     // 元データが飛んでいる直前の行は、区切りの印を元のまま書く
     const nextSync=(clean[index+1]?.page as any)?.sync;const mk=(p as any).marks;if((nextSync||(p as any).sync)&&mk){play.inning=mk.inning||play.inning;play.gameMark=mk.game||play.gameMark;}
     if(!nextSync&&index===clean.length-1&&mk?.game){play.gameMark=mk.game;if(mk.inning)play.inning=mk.inning;}
     // 試合が終わった最後の行は、3アウトでなくても（サヨナラなど）イニング完了
     if(index===clean.length-1&&!mk&&play.gameMark==='試合終了')play.inning='イニング完了';}
    const row=export191Row(before,p,info,item.seq,play);
    return row;
  });
}
