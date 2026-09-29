export type CreateGameDraft = {
  displayNo: string; date: string; time: string; stadium: string; weather: string;
  method: string; season: string; kind: string; week: string; day: string; gameNumber: string;
  umpire?: string; teams: { id: string; lineup: { playerId: string; position: string }[] }[];
};

export function validateCreateGame(d: CreateGameDraft) {
  const missing: string[] = [];
  for (const [label, value] of Object.entries({ 試合番号:d.displayNo, 日付:d.date, 時刻:d.time, 球場:d.stadium, 天気:d.weather, 入力方法:d.method, 季節:d.season, 種別:d.kind, 週:d.week, 日:d.day, 第何試合:d.gameNumber })) if (!String(value ?? "").trim()) missing.push(label);
  const seen = new Set<string>();
  for (const team of d.teams) {
    const rows=team.lineup;
    if(rows.length!==9||rows.some(x=>!x.playerId||!x.position)) missing.push(`${team.id}:打順・守備`);
    const players=rows.map(x=>x.playerId).filter(Boolean);
    if(new Set(players).size!==players.length) missing.push(`${team.id}:選手重複`);
    const positions=rows.map(x=>x.position).filter(Boolean);
    if(new Set(positions).size!==positions.length) missing.push(`${team.id}:守備位置重複`);
    for(const id of players){if(seen.has(id))missing.push("両チーム間の選手重複");seen.add(id)}
  }
  return { valid: missing.length===0, missing: [...new Set(missing)] };
}

export function canStartGame(games: {status:string}[]) { return !games.some(g=>g.status==="in_progress"); }
