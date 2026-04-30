import { Tabs } from "expo-router";
import React from "react";

import { CustomTabBar } from "@/components/custom-tab-bar";

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: true,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "ホーム", headerShown: false }} />
      <Tabs.Screen name="messages" options={{ title: "メッセージ" }} />
      <Tabs.Screen name="weight" options={{ title: "ウエイト", href: null }} />
      <Tabs.Screen name="menu" options={{ title: "メニュー" }} />
      {/* タブバーには表示しないがルートとして保持 */}
      <Tabs.Screen name="documents" options={{ title: "資料", href: null }} />
      <Tabs.Screen name="videos" options={{ title: "動画", href: null }} />
    </Tabs>
  );
}
