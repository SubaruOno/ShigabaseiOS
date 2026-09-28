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
export type LocalGame = { id: string; display_game_number: string; game_date: string; game_time: string; home_team_id: string; away_team_id: string; season: string; kind: string; week: string; day: string; game_number: number; stadium_id?: string | null; weather_id?: number | null; method: "live" | "video"; umpire?: string; tags: string[]; status: "draft" | "in_progress" | "completed" | "suspended"; lineup: unknown[]; home_name?: string; away_name?: string; stadium_name?: string; ohtani_rule?: boolean; };
export type LocalPlay = { seq: number; page: Page; client_mutation_id: string; created_at: string };
import type { Page } from "./engine";
async function read<T>(key: string, fallback: T): Promise<T> { const raw = await (await storage()).getItem(PREFIX + key); return raw ? JSON.parse(raw) as T : fallback; }
async function write<T>(key: string, value: T) { await (await storage()).setItem(PREFIX + key, JSON.stringify(value)); }
export const localStore = {
  games: () => read<LocalGame[]>("games", []),
  saveGames: (games: LocalGame[]) => write("games", games),
  plays: (gameId: string) => read<LocalPlay[]>(`plays:${gameId}`, []),
  savePlays: (gameId: string, plays: LocalPlay[]) => write(`plays:${gameId}`, plays),
  savePlay: async (gameId: string, page: Page) => { const plays=await read<LocalPlay[]>(`plays:${gameId}`,[]); plays.push({seq:plays.length+1,page,client_mutation_id:uuid(),created_at:new Date().toISOString()}); await write(`plays:${gameId}`,plays); return plays; },
  deviceId: async () => { let id = await read<string | null>("device", null); if (!id) { id = `device-${Date.now()}-${Math.random().toString(36).slice(2)}`; await write("device", id); } return id; },
};
function uuid(){return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==="x"?r:(r&3|8)).toString(16)})}
