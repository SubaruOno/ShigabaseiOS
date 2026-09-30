import { describe, expect, it } from 'vitest';
import { LEGACY_COURSE, LEGACY_FIELD, legacyCoursePoint, legacyFieldPoint, mirrorCoursePoint, oldCoursePointFromBASS, oldFieldPointFromBASS, convertSavedPageCoordinates } from './coords';

describe('legacy scoring coordinates', () => {
  it('maps tap fractions identically at representative rendered sizes', () => {
    const sizes = [[293,366],[400,500],[600,750],[320,400],[844,1055],[1024,768],[1366,1024],[2732,2048]];
    for (const [w,h] of sizes) {
      expect(legacyCoursePoint(w/w,h/h)).toEqual({x:LEGACY_COURSE.controlPoints,y:LEGACY_COURSE.controlPoints});
      expect(legacyFieldPoint(w/w,h/h)).toEqual({x:LEGACY_FIELD.controlPoints,y:LEGACY_FIELD.controlPoints});
    }
    expect(legacyCoursePoint(0,0)).toEqual({x:0,y:0});
    expect(legacyFieldPoint(0,0)).toEqual({x:0,y:0});
  });

  it('maps strike-zone corners to the old 5 by 5 grid inner 3 by 3 corners', () => {
    
    expect(oldCoursePointFromBASS({x:38.5,y:51})).toEqual({x:52.5,y:52.5});
    expect(oldCoursePointFromBASS({x:161,y:205})).toEqual({x:210,y:210});
  });

  it('uses the old home and base landmarks for approximate legacy conversion', () => {
    expect(oldFieldPointFromBASS({x:46,y:238})).toEqual({x:132,y:215.25});
    expect(oldFieldPointFromBASS({x:113,y:238})).toEqual({x:171,y:174.75});
    expect(oldFieldPointFromBASS({x:46,y:165})).toEqual({x:91.5,y:174.75});
    expect(LEGACY_FIELD.second).toEqual([176,182]);
  });

  it('converts old local pages once and leaves marked pages untouched', () => {
    const page:any={course:[60,80],batted_ball:{x:46,y:238}};
    const converted=convertSavedPageCoordinates(page);
    expect(converted.coords_version).toBe('legacy-excel-v1');
    expect(converted.batted_ball).toEqual({x:132,y:215.25});
    expect(convertSavedPageCoordinates(page)).toBe(page);
  });

  it('mirrors pitcher point of view without changing its stored catcher frame', () => {
    const point={x:31,y:190};
    expect(mirrorCoursePoint(mirrorCoursePoint(point))).toEqual(point);
    expect(mirrorCoursePoint(point)).toEqual({x:LEGACY_COURSE.controlPoints-31,y:190});
  });
});

describe('BASS座標の旧ページの移行（Claude確認）', () => {
  it('ストライクゾーンの角は旧画像のゾーンの角（ポイント単位）に移る', async () => {
    const { oldCoursePointFromBASS } = await import('./coords');
    const a = oldCoursePointFromBASS({ x: 38.5, y: 51 });
    expect(a.x).toBeCloseTo(70 * 0.75); expect(a.y).toBeCloseTo(70 * 0.75);
    const b = oldCoursePointFromBASS({ x: 161, y: 205 });
    expect(b.x).toBeCloseTo(280 * 0.75); expect(b.y).toBeCloseTo(280 * 0.75);
  });
  it('本塁・一塁・三塁は旧画像の同じ塁（ポイント単位）に移る', async () => {
    const { oldFieldPointFromBASS } = await import('./coords');
    const h = oldFieldPointFromBASS({ x: 46, y: 238 }); expect(h.x).toBeCloseTo(176 * 0.75); expect(h.y).toBeCloseTo(287 * 0.75);
    const f = oldFieldPointFromBASS({ x: 113, y: 238 }); expect(f.x).toBeCloseTo(228 * 0.75); expect(f.y).toBeCloseTo(233 * 0.75);
    const t = oldFieldPointFromBASS({ x: 46, y: 165 }); expect(t.x).toBeCloseTo(122 * 0.75); expect(t.y).toBeCloseTo(233 * 0.75);
  });
});

describe('新しく入れたページの座標は、読み込み直しても変わらない', () => {
  it('blank() から作ったページは変換されない', async () => {
    const { blank } = await import('./engine');
    const p = { ...blank(), course: [131.25, 131.25] as [number, number], batted_ball: { x: 132, y: 136.5 } as any };
    const again = convertSavedPageCoordinates(JSON.parse(JSON.stringify(p)));
    expect(again.course).toEqual([131.25, 131.25]);
    expect([again.batted_ball!.x, again.batted_ball!.y]).toEqual([132, 136.5]);
  });
});
