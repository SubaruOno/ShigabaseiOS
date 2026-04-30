import { ScrollView, Text, StyleSheet, View } from "react-native";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";

const SECTIONS = [
  {
    title: "1. 収集する情報",
    body: "本アプリは以下の情報を収集します。\n\n・メールアドレス（ログイン認証のため）\n・送受信したメッセージの内容\n・アップロードされたファイル（資料・映像）\n・プッシュ通知トークン（通知配信のため）\n・練習記録・ウエイト記録データ",
  },
  {
    title: "2. 利用目的",
    body: "収集した情報は以下の目的にのみ使用します。\n\n・チームメンバー間のコミュニケーション支援\n・資料・映像コンテンツの共有\n・プッシュ通知の配信\n・練習記録の管理",
  },
  {
    title: "3. 情報の保管",
    body: "収集した情報はSupabase（Amazon Web Servicesのサーバーを利用）に暗号化して保管されます。第三者がデータにアクセスできないよう、適切なアクセス制御を実施しています。",
  },
  {
    title: "4. 第三者への提供",
    body: "収集した個人情報を、以下の場合を除き第三者に提供することはありません。\n\n・法令に基づく場合\n・本人の同意がある場合\n\nなお、サービス運営のためSupabase Inc.およびApple Inc.のサービスを利用しています。",
  },
  {
    title: "5. データの削除",
    body: "アカウントを削除すると、メッセージ・ファイル・プッシュトークンを含むすべての個人データが削除されます。アカウント削除はメニュー画面から行えます。",
  },
  {
    title: "6. プッシュ通知",
    body: "プッシュ通知はExpo Push Notification ServiceおよびAppleのAPNsを経由して配信されます。通知はいつでもiOSの設定からオフにできます。",
  },
  {
    title: "7. お問い合わせ",
    body: "本プライバシーポリシーに関するお問い合わせはチーム管理者までご連絡ください。",
  },
];

export default function PrivacyPolicyScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
    >
      <Text style={[styles.heading, { color: colors.text }]}>
        プライバシーポリシー
      </Text>
      <Text style={[styles.intro, { color: colors.icon }]}>
        滋賀大学野球部（以下「当チーム」）は、本アプリにおける個人情報の取り扱いについて、以下のとおり定めます。
      </Text>

      {SECTIONS.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {section.title}
          </Text>
          <Text style={[styles.sectionBody, { color: colors.icon }]}>
            {section.body}
          </Text>
        </View>
      ))}

      <Text style={[styles.updated, { color: colors.icon }]}>
        制定日：2026年3月
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 20, paddingBottom: 48 },
  heading: { fontSize: 22, fontWeight: "700" },
  intro: { fontSize: 14, lineHeight: 22 },
  section: { gap: 6 },
  sectionTitle: { fontSize: 15, fontWeight: "600" },
  sectionBody: { fontSize: 14, lineHeight: 22 },
  updated: { fontSize: 12, marginTop: 8 },
});
