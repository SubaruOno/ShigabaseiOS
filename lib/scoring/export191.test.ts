import { describe, expect, it } from 'vitest';
import { COLUMN191_HEADERS, export191Row } from './export191';
import { blank, initState } from './engine';

const info = { dateTime: '2026-09-29 10:00:00', season: '秋季', kind: 'リーグ戦', week: '1', day: '1', gameNumber: 1, homeTeam: '滋賀大学(テスト)', awayTeam: '対戦校(テスト)', pitcherNames: ['P-home','P-away'] as [string,string], catcherNames: ['C-home','C-away'] as [string,string], lineupNames: [Array.from({length:9},(_,i)=>`H${i+1}`),Array.from({length:9},(_,i)=>`A${i+1}`)] as [string[],string[]], lineupPositions: [[1,2,3,4,5,6,7,8,9],[1,2,3,4,5,6,7,8,9]] as unknown as [string[],string[]], hands: [Array(9).fill('右'),Array(9).fill('左')] as [string[],string[]], pitcherHands: ['右','左'] as [string,string] };
describe('191-column export',()=>{
  it('keeps the 191 saved-file header order and emits score/lineup/pitcher fields',()=>{
    expect(COLUMN191_HEADERS).toHaveLength(191);expect(COLUMN191_HEADERS.slice(0,10)).toEqual(['試合日時（時刻含む）','Season','Kind','Week','Day','GameNumber','主審','後攻チーム','先攻チーム','プレイの番号']);expect(COLUMN191_HEADERS[174]).toBe('3');expect(COLUMN191_HEADERS[180]).toBe('9');
    const row=export191Row(initState(),blank(),info,1,{result:'ボール',pitchType:'ストレート'});
    expect(row).toHaveLength(191);expect(row[0]).toBe(info.dateTime);expect(row[9]).toBe(1);expect(row[44]).toBe('ストレート');expect(row[56]).toBe('');expect(row[174]).toBe('A3');
  });
  it('writes skip PA as a result row with pitch fields zeroed',()=>{
    const row=export191Row(initState(),{...blank(),skip:true},info,1,{skipPa:true,result:'凡打',batterStatus:'アウト',pitchType:'FB',course:[120,150]});
    expect(row[40]).toBe('投球');expect(row[42]).toBe(0);expect(row[43]).toBe(0);expect(row[44]).toBe('0');expect(row[45]).toBe('凡打');expect(row[185]).toBe('');
  });
});
