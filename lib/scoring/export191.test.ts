import { describe, expect, it } from 'vitest';
import { COLUMN191_HEADERS, export191Csv, export191Game, export191Row } from './export191';
import { blank, initState, type Page } from './engine';

const headers = [
  '試合日時（時刻含む）','Season','Kind','Week','Day','GameNumber','主審','後攻チーム','先攻チーム','プレイの番号','回','表/裏','先攻得点','後攻得点','S','B','アウト','打席の継続','イニング継続','試合継続','一走打順','一走氏名','二走打順','二走氏名','三走打順','三走氏名','打順','打者氏名','打席左右','作戦','作戦２','作戦結果','投手氏名','投手左右','球数','捕手','一走状況','二走状況','三走状況','打者状況','プレイの種類','構え','コースX','コースY','球種','打撃結果','打撃結果２','捕球選手','打球タイプ','打球強度','打球位置X','打球位置Y','牽制の種類','牽制詳細','エラーの種類','タイムの種類','球速',
  ...Array.from({length:9},(_,i)=>`${i+1}番守備`),...Array.from({length:9},(_,i)=>`${i+1}番氏名`),'投手氏名',
  ...Array.from({length:9},(_,i)=>`${i+1}番守備`),...Array.from({length:9},(_,i)=>`${i+1}番氏名`),'投手氏名',
  ...Array.from({length:9},(_,i)=>[`${i+1}番○打`,`${i+1}番タイプ`]).flat(),'投手○投','投手背番号',
  ...Array.from({length:9},(_,i)=>[`${i+1}番○打`,`${i+1}番タイプ`]).flat(),'投手○投','投手背番号','首振り',
  ...Array.from({length:15},(_,i)=>String(i+1)),...Array.from({length:15},(_,i)=>String(i+1)),
  '球種１','球種２','球種３','球種４','球種１','球種２','球種３','球種４','3','4','5','6','7','8','9','記録者','攻撃チーム','勝利チーム','得点チーム','投球数／打席','タイミング','リアクション','打者タイプ','クイック','牽制の強さ',
];
const lineup = (team_id:string, prefix:string, pos:number[]) => pos.map((position_id,i)=>({team_id,slot:i+1,position_id,uniform_no:i+1,batting_hand:'R',throwing_hand:'R',player_snapshot:{id:`${prefix}-${i+1}`,name:`${prefix}-${i+1}`,uniform_no:i+1}})).concat([{team_id,slot:10,position_id:1,uniform_no:10,batting_hand:'R',throwing_hand:'R',player_snapshot:{id:`${prefix}-P`,name:`${prefix}-P`,uniform_no:10}}]);
const game:any={dateTime:'2026-09-30 10:00:00',season:'秋季',kind:'リーグ戦',week:'1',day:'1',gameNumber:1,homeTeam:'HOME',awayTeam:'AWAY',home_team_id:'home',away_team_id:'away'};
const rosters=[...lineup('away','A',[1,2,3,4,5,6,7,8,9]),...lineup('home','H',[1,2,3,4,5,6,7,8,9])];
const page=(patch:Partial<Page>):Page=>({...blank(),...patch});

describe('191-column export',()=>{
  it('matches every saved-file header name and its order',()=>{expect(COLUMN191_HEADERS).toEqual(headers);expect(COLUMN191_HEADERS).toHaveLength(191)});
  it('writes state, lineup and defending 1B through RF columns',()=>{
    const rows=export191Game(game,rosters,[{seq:1,page:page({res:{label:'単打',kind:1},ra:{0:{to:1}}})},{seq:2,page:page({res:{label:'単打',kind:1},ra:{0:{to:1},1:{to:4}}})}],{});
    expect(rows).toHaveLength(2);expect(rows[0][10]).toBe(1);expect(rows[0][11]).toBe('表');expect(rows[0][14]).toBe(0);expect(rows[1][20]).toBe(1);
    expect(rows[0][57]).toBe('1');expect(rows[0][58]).toBe('A-1');expect(rows[0].slice(174,181)).toEqual(['H-3','H-4','H-5','H-6','H-7','H-8','H-9']);
  });
  it('writes automatic runner moves as 本進/出塁 even when nothing was moved by hand',()=>{
    const rows=export191Game(game,rosters,[{seq:1,page:page({res:{label:'三塁打',kind:3}})},{seq:2,page:page({res:{label:'単打',kind:1}})}],{});
    expect(rows[1][38]).toBe('本進');expect(rows[1][39]).toBe('出塁');
  });
  it('marks pinch hitter and pinch runner from the engine substitution state',()=>{
    const rows=export191Game(game,rosters,[
      {seq:1,page:page({res:{label:'単打',kind:1},ra:{0:{to:1}}})},
      {seq:2,page:page({subs:[{t:0,slot:0,no:12,pos:7}]})},
      {seq:3,page:page({subs:[{t:0,slot:1,no:13,pos:8}]})},
      {seq:4,page:page({res:{label:'ボール',kind:'FO'}})},
    ],{players:[{team_id:'away',name:'A-12',uniform_no:12},{team_id:'away',name:'A-13',uniform_no:13}]});
    expect(rows[3][20]).toBe('R');expect(rows[3][21]).toBe('A-12');expect(rows[3][26]).toBe('H');expect(rows[3][27]).toBe('A-13');
  });
  it('writes pickoff, substitution and skip-PA rows',()=>{
    const rows=export191Game(game,rosters,[
      {seq:1,page:page({pickoff_throw_to:1})},
      {seq:2,page:page({subs:[{t:1,slot:2,no:12,pos:2}],res:null})},
      {seq:3,page:page({skip:true,ra:{0:{out:true}}})},
    ],{});
    expect(rows[0][40]).toBe('牽制');expect(rows[0][52]).toBe('一塁牽制');
    expect(rows[1][40]).toBe('交代');
    expect(rows[2][40]).toBe('投球');expect(rows[2][42]).toBe(0);expect(rows[2][43]).toBe(0);expect(rows[2][44]).toBe('0');
  });
  it('uses the UTF-8 BOM and CSV-escapes cells',()=>{
    const csv=export191Csv([["a,b",'say "hi"']]);expect(csv.charCodeAt(0)).toBe(0xfeff);expect(csv).toContain('"a,b","say ""hi"""');
  });
  it('writes a synthetic row directly from the row exporter',()=>{
    const row=export191Row(initState(),blank(),{...game,pitcherNames:['HP','AP'],catcherNames:['HC','AC'],lineupNames:[Array.from({length:9},(_,i)=>`A${i+1}`),Array.from({length:9},(_,i)=>`H${i+1}`)],lineupPositions:[Array.from({length:9},(_,i)=>String(i+1)),Array.from({length:9},(_,i)=>String(i+1))],hands:[Array(9).fill('右'),Array(9).fill('左')],pitcherHands:['右','左']},1,{result:'ボール'});
    expect(row).toHaveLength(191);expect(row[9]).toBe(1);expect(row[45]).toBe('ボール');
  });
});
