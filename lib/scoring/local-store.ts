import { Platform } from "react-native";

const PREFIX = "shigabase:scoring:";
type StorageLike = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
let webMemory = new Map<string, string>();
async function storage(): Promise<StorageLike> {
  if (Platform.OS === "web") {
    return {
      getItem: async (key) => typeof localStorage !== "undefined" ? localStorage.getItem(key) : webMemory.get(key) ?? null,
      setItem: async (key, value) => { if (typeof localStorage !== "undefined") localStorage.setItem(key, value); else webMemory.set(key, value); },
    };
  }
  // アプリに組み込み済みの expo-file-system で、端末の書類フォルダにキーごとのファイルとして保存する（ネット不要）
  const FS = await import("expo-file-system/legacy");
  const dir = `${FS.documentDirectory}scoring/`;
  const path = (key: string) => dir + key.replace(/[^A-Za-z0-9_-]/g, "_") + ".json";
  const info = await FS.getInfoAsync(dir);
  if (!info.exists) await FS.makeDirectoryAsync(dir, { intermediates: true });
  return {
    getItem: async (key) => { const p = path(key); return (await FS.getInfoAsync(p)).exists ? FS.readAsStringAsync(p) : null; },
    setItem: async (key, value) => { await FS.writeAsStringAsync(path(key), value); },
  };
}
export type LocalGame = { id: string; display_game_number: string; game_date: string; game_time: string; home_team_id: string; away_team_id: string; season: string; kind: string; week: string; day: string; game_number: number; stadium_id?: string | null; weather_id?: number | null; weather_name?: string; method: "live" | "video"; umpire?: string; tags: string[]; status: "draft" | "in_progress" | "completed" | "suspended"; lineup: unknown[]; home_name?: string; away_name?: string; stadium_name?: string; ohtani_rule?: boolean; synced_at?: string; score_home?: number; score_away?: number; };
export type LocalPlay = { seq: number; page: Page; client_mutation_id: string; created_at: string };
import type { Page } from "./engine";
async function read<T>(key: string, fallback: T): Promise<T> { const raw = await (await storage()).getItem(PREFIX + key); return raw ? JSON.parse(raw) as T : fallback; }
async function write<T>(key: string, value: T) { await (await storage()).setItem(PREFIX + key, JSON.stringify(value)); }
export const localStore = {
  games: () => read<LocalGame[]>("games", []),
  saveGames: (games: LocalGame[]) => write("games", games),
  masters: (kind: string) => read<Record<string, unknown>[]>(`master:${kind}`, []),
  saveMasters: (kind: string, rows: Record<string, unknown>[]) => write(`master:${kind}`, rows),
  plays: (gameId: string) => read<LocalPlay[]>(`plays:${gameId}`, []),
  rosterPlayers: (teamId: string) => read<Record<string, unknown>[]>(`roster:${teamId}`, []),
  saveRosterPlayers: (teamId: string, players: Record<string, unknown>[]) => write(`roster:${teamId}`, players),
  replaceLocalPlayerId: async (oldId: string, newId: string) => {
    const games = await read<LocalGame[]>("games", []);
    await write("games", games.map(game => ({...game, lineup: ((game.lineup ?? []) as Array<Record<string, any>>).map(row => row.roster_player_id === oldId || row.player_snapshot?.id === oldId ? {...row, roster_player_id: newId, player_snapshot: {...row.player_snapshot, id: newId}} : row)})));
    const teamIds = [...new Set(games.flatMap(game => [game.home_team_id, game.away_team_id]))];
    for (const teamId of teamIds) {
      const players = await read<Record<string, any>[]>(`roster:${teamId}`, []);
      await write(`roster:${teamId}`, players.map(player => player.id === oldId ? {...player, id: newId, provisional: false} : player));
    }
    for (const game of games) {
      const plays = await read<LocalPlay[]>(`plays:${game.id}`, []);
      const next = plays.map(play => {
        const page = JSON.parse(JSON.stringify(play.page)) as any;
        let changed = false;
        for (const [key, value] of Object.entries(page.ra ?? {})) if (value && typeof value === "object" && (value as any).player_id === oldId) { (value as any).player_id = newId; changed = true; }
        return changed ? {...play, page} : play;
      });
      if (next.some((play, index) => play !== plays[index])) await write(`plays:${game.id}`, next);
    }
  },
  savePlays: (gameId: string, plays: LocalPlay[]) => write(`plays:${gameId}`, plays),
  // 確定前のページ（入力途中の1球）。アプリが落ちても続きから入れられるよう別に持つ
  draft: (gameId: string) => read<Page | null>(`draft:${gameId}`, null),
  saveDraft: (gameId: string, page: Page | null) => write(`draft:${gameId}`, page),
  savePlay: async (gameId: string, page: Page) => { const plays=await read<LocalPlay[]>(`plays:${gameId}`,[]); plays.push({seq:plays.length+1,page,client_mutation_id:uuid(),created_at:new Date().toISOString()}); await write(`plays:${gameId}`,plays); return plays; },
  deviceId: async () => { let id = await read<string | null>("device", null); if (!id) { id = `device-${Date.now()}-${Math.random().toString(36).slice(2)}`; await write("device", id); } return id; },
};
function uuid(){return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==="x"?r:(r&3|8)).toString(16)})}

// プレイの識別番号は、試合IDと順番から毎回同じuuidを作る（同期で二重登録しないため）
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v:unknown):v is string{return typeof v==="string"&&UUID_RE.test(v)}
export function playMutationId(gameId:string,seq:number):string{
  const src=`${gameId}:${seq}`;let h1=0x811c9dc5,h2=0x01000193,h3=0x9e3779b9,h4=0x85ebca6b;
  for(let i=0;i<src.length;i++){const c=src.charCodeAt(i);h1=Math.imul(h1^c,16777619);h2=Math.imul(h2^c,2246822507);h3=Math.imul(h3^c,3266489909);h4=Math.imul(h4^c,668265263)}
  const hex=[h1,h2,h3,h4].map(h=>(h>>>0).toString(16).padStart(8,"0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-${(8+(parseInt(hex[16],16)&3)).toString(16)}${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
