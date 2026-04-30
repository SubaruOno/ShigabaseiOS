import { useEffect, useState } from "react";
import Constants from "expo-constants";
import { supabase } from "@/lib/supabase";

function isVersionOutdated(current: string, minimum: string): boolean {
  const c = current.split(".").map(Number);
  const m = minimum.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((c[i] ?? 0) < (m[i] ?? 0)) return true;
    if ((c[i] ?? 0) > (m[i] ?? 0)) return false;
  }
  return false;
}

export function useForceUpdate() {
  const [needsUpdate, setNeedsUpdate] = useState(false);

  useEffect(() => {
    async function check() {
      const { data, error } = await supabase
        .from("app_config")
        .select("value")
        .eq("key", "min_ios_version")
        .single();

      if (error || !data) return;

      const currentVersion = Constants.expoConfig?.version ?? "0.0.0";
      setNeedsUpdate(isVersionOutdated(currentVersion, data.value));
    }

    check();
  }, []);

  return { needsUpdate };
}
