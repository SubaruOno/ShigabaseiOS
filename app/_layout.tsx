import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { useEffect } from "react";
import { TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { AuthProvider } from "@/hooks/use-auth";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useForceUpdate } from "@/hooks/use-force-update";
import { CONTENT_MAX_WIDTH } from "@/hooks/use-layout";

// 一覧やフォームの画面は、iPadやブラウザで横に伸びすぎないよう中央に寄せる
const NARROW_CONTENT = { width: "100%", maxWidth: CONTENT_MAX_WIDTH, alignSelf: "center" } as const;
import { ForceUpdateModal } from "@/components/force-update-modal";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000, // 2分: 画面遷移ごとの無駄な再フェッチを防ぐ
      retry: 1,
    },
  },
});

if (Constants.isDevice) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

function AppLayout() {
  console.log("[AppLayout] render start");
  const colorScheme = useColorScheme();
  const router = useRouter();
  console.log("[AppLayout] after useRouter");
  const { needsUpdate } = useForceUpdate();
  console.log("[AppLayout] after useForceUpdate");

  usePushNotifications();
  console.log("[AppLayout] after usePushNotifications");

  const lastNotificationResponse = Notifications.useLastNotificationResponse();
  console.log("[AppLayout] after useLastNotificationResponse:", !!lastNotificationResponse);

  useEffect(() => {
    if (!lastNotificationResponse) return;
    const data = lastNotificationResponse.notification.request.content
      .data as { type?: string; conversationId?: string; contentType?: string };
    if (data?.type === "dm" && data.conversationId) {
      router.push(`/chat/${data.conversationId}` as never);
    } else if (data?.type === "weight_reminder") {
      router.push("/(tabs)/weight");
    } else if (data?.type === "content") {
      if (data.contentType === "video") {
        router.push("/(tabs)/videos");
      } else if (data.contentType === "practice_video") {
        router.push("/scores");
      } else if (data.contentType === "game") {
        router.push("/game-analysis" as never);
      } else {
        router.push("/(tabs)/documents");
      }
    }
  }, [lastNotificationResponse, router]);

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="scoring/index" options={{ title: "試合記録", headerBackTitle: "戻る" }} />
        <Stack.Screen name="scoring/create" options={{ title: "新規試合入力", headerBackTitle: "試合記録" }} />
        <Stack.Screen name="scoring/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="scoring/masters" options={{ title: "マスター管理", headerBackTitle: "戻る" }} />
        <Stack.Screen name="scoring/master" options={{ title: "マスター項目", headerBackTitle: "マスター管理" }} />
        <Stack.Screen name="scoring/manage" options={{ title: "試合管理", headerBackTitle: "試合記録" }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ headerShown: false }} />
        <Stack.Screen
          name="admin/invite"
          options={{ title: "招待コード管理", headerBackTitle: "戻る" }}
        />
        <Stack.Screen
          name="scores"
          options={{ title: "練習映像", headerBackTitle: "戻る" }}
        />
        <Stack.Screen
          name="weight-records"
          options={{ title: "ウエイト記録", headerBackTitle: "戻る" }}
        />
        <Stack.Screen
          name="chat/[id]"
          options={{ title: "", headerBackTitle: "戻る" }}
        />
        <Stack.Screen
          name="upload"
          options={{ contentStyle: NARROW_CONTENT,
            title: "コンテンツ投稿",
            headerLeft: () => (
              <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
                <Ionicons name="chevron-back" size={24} color="#0a7ea4" />
              </TouchableOpacity>
            ),
          }}
        />
        <Stack.Screen
          name="admin/players"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="analytics/index"
          options={{ title: "データ分析", headerBackTitle: "戻る" }}
        />
        <Stack.Screen
          name="analytics/scout"
          options={{ contentStyle: NARROW_CONTENT, title: "データ分析", headerBackTitle: "戻る" }}
        />
        <Stack.Screen
          name="game-analysis/index"
          options={{ contentStyle: NARROW_CONTENT, title: "試合結果", headerBackTitle: "戻る" }}
        />
        <Stack.Screen
          name="game-analysis/[id]"
          options={{ title: "試合詳細", headerBackTitle: "戻る" }}
        />
        <Stack.Screen
          name="player-stats/[name]"
          options={{ title: "選手成績", headerBackTitle: "戻る" }}
        />
        <Stack.Screen
          name="privacy-policy"
          options={{ title: "プライバシーポリシー", headerBackTitle: "戻る" }}
        />
        <Stack.Screen
          name="weight-export"
          options={{ title: "データ出力", headerBackTitle: "戻る" }}
        />
        <Stack.Screen
          name="bullpen/index"
          options={{ contentStyle: NARROW_CONTENT, title: "ブルペン", headerBackTitle: "戻る" }}
        />
        <Stack.Screen
          name="bullpen/[id]"
          options={{ headerBackTitle: "戻る" }}
        />
        <Stack.Screen
          name="bullpen/record"
          options={{ contentStyle: NARROW_CONTENT, headerShown: false }}
        />
        <Stack.Screen
          name="opponent-pitchers/index"
          options={{ contentStyle: NARROW_CONTENT, title: "相手投手", headerBackTitle: "戻る" }}
        />
        <Stack.Screen
          name="opponent-pitchers/[name]"
          options={{ headerBackTitle: "戻る" }}
        />
      </Stack>
      <StatusBar style="auto" />
      <ForceUpdateModal visible={needsUpdate} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppLayout />
      </AuthProvider>
    </QueryClientProvider>
  );
}
