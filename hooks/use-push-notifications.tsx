import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./use-auth";

export function usePushNotifications() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    if (!Constants.isDevice) return;

    const register = async () => {
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "default",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#FF231F7C",
        });
      }

      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted") return;

      const projectId = Constants.expoConfig?.extra?.eas?.projectId as
        | string
        | undefined;
      if (!projectId) return;

      try {
        const { data: token } = await Notifications.getExpoPushTokenAsync({
          projectId,
        });
        await supabase.from("push_tokens").upsert(
          { user_id: user.id, token, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
      } catch (e) {
        console.error("Push token registration failed:", e);
      }
    };

    register();
  }, [user?.id]);
}
