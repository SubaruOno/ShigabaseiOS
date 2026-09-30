/** Legacy Excel image-control coordinate system (VBA MouseDown X/Y in points). */
export const LEGACY_COURSE = { imagePixels: 351, pointsPerPixel: 0.75, controlPoints: 263.25, zone: { left: 70, top: 70, right: 280, bottom: 280 } } as const;
export const LEGACY_FIELD = { imagePixels: 353, pointsPerPixel: 0.75, controlPoints: 264.75, home: [176, 287] as const, first: [228, 233] as const, second: [176, 182] as const, third: [122, 233] as const } as const;

export type Point = { x: number; y: number };
export function fractionsToLegacyPoint(fractionX: number, fractionY: number, controlPoints: number): Point {
  return { x: fractionX * controlPoints, y: fractionY * controlPoints };
}
export function legacyCoursePoint(fractionX: number, fractionY: number): Point {
  return fractionsToLegacyPoint(fractionX, fractionY, LEGACY_COURSE.controlPoints);
}
export function legacyFieldPoint(fractionX: number, fractionY: number): Point {
  return fractionsToLegacyPoint(fractionX, fractionY, LEGACY_FIELD.controlPoints);
}
export function mirrorCoursePoint(point: Point): Point {
  return { x: LEGACY_COURSE.controlPoints - point.x, y: point.y };
}

/** Approximate migration from the former 280x280 BASS-like field SVG (old pages only).
 * Exact affine fit on home, first and third base (BASS: home(46,238), 1B(113,238), 3B(46,165);
 * old image pixels converted to legacy points ×0.75). Outfield depth differs between the two diagrams,
 * so far fly balls are only approximate. New input records legacy points directly. */
export function oldFieldPointFromBASS(point: Point): Point {
  const k = LEGACY_FIELD.pointsPerPixel;
  const H = { x: LEGACY_FIELD.home[0] * k, y: LEGACY_FIELD.home[1] * k };
  const F = { x: LEGACY_FIELD.first[0] * k, y: LEGACY_FIELD.first[1] * k };
  const T = { x: LEGACY_FIELD.third[0] * k, y: LEGACY_FIELD.third[1] * k };
  const u = (point.x - 46) / (113 - 46); // along the 1B line
  const v = (238 - point.y) / (238 - 165); // along the 3B line
  return { x: H.x + u * (F.x - H.x) + v * (T.x - H.x), y: H.y + u * (F.y - H.y) + v * (T.y - H.y) };
}

export function oldCoursePointFromBASS(point: Point): Point {
  // The former strike rectangle was x=38.5..161, y=51..205 in a 200x250 viewBox; the old zone is in image pixels ×0.75.
  const { zone, pointsPerPixel: k } = LEGACY_COURSE;
  return { x: (zone.left + (point.x - 38.5) * (zone.right - zone.left) / (161 - 38.5)) * k, y: (zone.top + (point.y - 51) * (zone.bottom - zone.top) / (205 - 51)) * k };
}

export function convertSavedPageCoordinates<T extends { coords_version?: 'legacy-excel-v1'; course: [number,number] | null; batted_ball: ({x:number;y:number} & Record<string,unknown>) | null }>(page:T): T {
  if (page.coords_version === 'legacy-excel-v1') return page;
  if (page.course) { const p=oldCoursePointFromBASS({x:page.course[0],y:page.course[1]}); page.course=[p.x,p.y]; }
  if (page.batted_ball) { const p=oldFieldPointFromBASS(page.batted_ball); page.batted_ball={...page.batted_ball,x:p.x,y:p.y}; }
  page.coords_version='legacy-excel-v1';
  return page;
}
