import { useEffect, useState } from "react";
import * as FileSystem from "expo-file-system/legacy";
import * as WebBrowser from "expo-web-browser";
import { Linking } from "react-native";

type CacheStatus = "checking" | "downloading" | "cached" | "error";

const CACHE_DIR = FileSystem.documentDirectory + "doc-cache/";

function getLocalPath(docId: string, fileUrl: string): string {
  const ext = fileUrl.split(".").pop()?.split("?")[0] ?? "file";
  return CACHE_DIR + docId + "." + ext;
}

async function ensureDirExists() {
  const info = await FileSystem.getInfoAsync(CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  }
}

export function useDocumentCache(docId: string, fileUrl: string) {
  const [status, setStatus] = useState<CacheStatus>("checking");

  useEffect(() => {
    if (!docId || !fileUrl) return;

    let cancelled = false;

    const run = async () => {
      try {
        const localPath = getLocalPath(docId, fileUrl);
        const info = await FileSystem.getInfoAsync(localPath);

        if (info.exists) {
          if (!cancelled) setStatus("cached");
          return;
        }

        if (!cancelled) setStatus("downloading");
        await ensureDirExists();
        await FileSystem.downloadAsync(fileUrl, localPath);

        if (!cancelled) setStatus("cached");
      } catch (e) {
        console.warn("Document cache error:", e);
        if (!cancelled) setStatus("error");
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [docId, fileUrl]);

  const open = async () => {
    const localPath = getLocalPath(docId, fileUrl);
    if (status === "cached") {
      try {
        // ローカルファイルを Quick Look / OS ビューアで開く
        const supported = await Linking.canOpenURL(localPath);
        if (supported) {
          await Linking.openURL(localPath);
          return;
        }
      } catch {
        // fallthrough
      }
    }
    // キャッシュ未完了またはフォールバック
    await WebBrowser.openBrowserAsync(fileUrl);
  };

  return { status, open };
}
