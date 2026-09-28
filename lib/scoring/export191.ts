import { GameState, Page, TeamSetup, batterOf, pitcherOf } from './engine';

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

export type GameExportInfo = { dateTime: string; season: string; kind: string; week: string; day: string; gameNumber: number; homeTeam: string; awayTeam: string; umpire?: string; scorer?: string; pitcherNames: [string,string]; catcherNames: [string,string]; lineupNames: [string[],string[]]; lineupPositions: [string[],string[]]; hands: [string[],string[]]; pitcherHands: [string,string]; };
export type PlayExportInfo = { result?: string; result2?: string; pitchType?: string; pitchSpeed?: number; course?: [number,number]; ballType?: string; ballRank?: string; ballXY?: [number,number]; featureName?: string; pitchSetup?: number; runnerStatus?: [string,string,string]; batterStatus?: string; playType?: string; catchFielder?: string; operation?: string; operationDetail?: string; operationResult?: string; pickoffDetail?: string; pickoffStrength?: string; quick?: string; skipPa?: boolean; };

const posCode = (n: number) => n === 10 ? 'D' : n >= 1 && n <= 9 ? String(n) : '';
export function export191Row(st: GameState, page: Page, info: GameExportInfo, playNo: number, play: PlayExportInfo = {}): (string|number)[] {
  const row: (string|number)[] = Array(191).fill('');
  const put = (col: number, val: string|number|undefined|null) => { row[col-1] = val ?? ''; };
  const side = st.half, batNo = st.bi[side], batter = batterOf(st), pitcher = pitcherOf(st);
  put(1,info.dateTime);put(2,info.season);put(3,info.kind);put(4,info.week);put(5,info.day);put(6,info.gameNumber);put(7,info.umpire);
  put(8,info.homeTeam);put(9,info.awayTeam);put(10,playNo);put(11,st.inn);put(12,side===0?'表':'裏');put(13,st.score[0]);put(14,st.score[1]);put(15,st.s);put(16,st.b);put(17,st.outs);
  put(18,play.skipPa?'打席完了':'打席継続');put(19,st.line[side][st.inn-1] == null?'イニング開始':'イニング継続');put(20,'試合継続');
  st.bases.forEach((id,i)=>{if(id==null)return;put(21+i*2, info.lineupNames[side].indexOf(String(id))+1 || 'R'); put(22+i*2,String(id)); put(37+i,play.runnerStatus?.[i] || '継続');});
  put(27,batNo+1);put(28,String(batter));put(29,info.hands[side][batNo]);put(30,play.operation);put(31,play.operationDetail);put(32,play.operationResult);put(33,String(pitcher));put(34,info.pitcherHands[1-side]);put(35,st.pcount[pitcher]||0);put(36,info.catcherNames[1-side]);put(40,play.batterStatus);put(41,play.playType || '投球');put(42,play.pitchSetup);put(43,play.course?.[0]);put(44,play.course?.[1]);put(45,play.pitchType);put(46,play.result);put(47,play.result2);put(48,play.catchFielder);put(49,play.featureName);put(50,play.ballRank);put(51,play.ballXY?.[0]);put(52,play.ballXY?.[1]);put(53,page.pickoff_throw_to?`${page.pickoff_throw_to}塁牽制`:undefined);put(54,play.pickoffDetail);put(57,play.pitchSpeed);
  for(let team=0;team<2;team++){const base=team===0?58:77;for(let slot=0;slot<9;slot++){put(base+slot*2,posCode(info.lineupPositions[team][slot] as unknown as number));put(base+slot*2+1,info.lineupNames[team][slot]);}put(team===0?76:95,info.pitcherNames[team]);}
  for(let team=0;team<2;team++){const start=team===0?96:116;for(let slot=0;slot<9;slot++){put(start+slot*2+1,info.hands[team][slot]);put(start+slot*2+2,0);}put(team===0?114:134,info.pitcherHands[team]);}
  for(let i=0;i<15;i++){put(137+i,st.line[0][i]??'');put(152+i,st.line[1][i]??'');}
  // Columns 175-181 are current defending 1B through RF player names.
  for(let pos=3;pos<=9;pos++){const slot=info.lineupPositions[1-side].findIndex(v=>Number(v)===pos);put(172+pos,slot>=0?info.lineupNames[1-side][slot]:'');}
  put(182,info.scorer);put(183,side===0?info.awayTeam:info.homeTeam);put(186,play.skipPa?'':1);put(190,play.quick);
  if(play.skipPa){ put(41,'投球');put(45,'0');put(43,0);put(44,0);put(46,play.result);put(40,play.batterStatus); }
  return row;
}
export function export191(rows: (string|number)[][]): string { return [COLUMN191_HEADERS.join('\t'),...rows.map(row=>COLUMN191_HEADERS.map((_,i)=>String(row[i]??'')).join('\t'))].join('\n'); }
