import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
} from "react-native";
import { useState } from "react";
import { Redirect } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";

type Tab = "document" | "video";

function SelectPicker({
  label,
  value,
  placeholder,
  options,
  onSelect,
  disabled,
  required,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: { id: string; name: string }[];
  onSelect: (val: string) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const selected = options.find((o) => o.id === value);

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text }]}>
        {label}
        {required && <Text style={{ color: "#ef4444" }}> *</Text>}
      </Text>
      <TouchableOpacity
        style={[
          styles.selectBtn,
          {
            borderColor: disabled ? colors.icon + "50" : colors.icon,
            backgroundColor: colors.cardBg,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
        onPress={() => !disabled && setVisible(true)}
        disabled={disabled}
      >
        <Text
          style={[
            styles.selectBtnText,
            { color: selected ? colors.text : colors.icon },
          ]}
          numberOfLines={1}
        >
          {selected?.name ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.icon} />
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="slide">
        <TouchableOpacity
          style={styles.modalOverlay}
          onPress={() => setVisible(false)}
        />
        <View
          style={[
            styles.modalSheet,
            {
              backgroundColor: colorScheme === "dark" ? "#2c2c2e" : "#fff",
            },
          ]}
        >
          <Text style={[styles.modalTitle, { color: colors.text }]}>
            {label}
          </Text>
          <ScrollView>
            <TouchableOpacity
              style={[styles.modalItem, { borderBottomColor: colors.icon }]}
              onPress={() => {
                onSelect("");
                setVisible(false);
              }}
            >
              <Text style={[styles.modalItemText, { color: colors.icon }]}>
                選択なし
              </Text>
            </TouchableOpacity>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={[styles.modalItem, { borderBottomColor: colors.icon }]}
                onPress={() => {
                  onSelect(opt.id);
                  setVisible(false);
                }}
              >
                <Text style={[styles.modalItemText, { color: colors.text }]}>
                  {opt.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

export default function UploadScreen() {
  const { user, hasRole } = useAuth();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("document");

  // Document form
  const [docTitle, setDocTitle] = useState("");
  const [docPageType, setDocPageType] = useState("");
  const [docCategory, setDocCategory] = useState("");
  const [docPlayer, setDocPlayer] = useState("");
  const [docTeam1, setDocTeam1] = useState("");
  const [docFile, setDocFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);

  // Video form
  const [videoTitle, setVideoTitle] = useState("");
  const [videoPageType, setVideoPageType] = useState("");
  const [videoCategory, setVideoCategory] = useState("");
  const [videoTeam1, setVideoTeam1] = useState("");
  const [videoTeam2, setVideoTeam2] = useState("");
  const [videoUrl, setVideoUrl] = useState("");

  const { data: categories } = useQuery({
    queryKey: ["all-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("display_order");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: players } = useQuery({
    queryKey: ["players"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("players")
        .select("*")
        .order("display_order");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: opponents } = useQuery({
    queryKey: ["opponent_teams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opponent_teams")
        .select("*")
        .order("display_order");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const docCategories =
    categories?.filter(
      (c) => c.type === "document" && (!docPageType || c.page_type === docPageType)
    ) ?? [];

  const videoCategories =
    categories?.filter(
      (c) => c.type === "video" && (!videoPageType || c.page_type === videoPageType)
    ) ?? [];

  const uploadDocMutation = useMutation({
    mutationFn: async () => {
      if (!docTitle.trim()) throw new Error("タイトルを入力してください");
      if (!docCategory) throw new Error("カテゴリを選択してください");
      if (!docFile) throw new Error("ファイルを選択してください");

      // Supabase Storage にアップロード
      const ext = docFile.name.split(".").pop();
      const filePath = `${user!.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

      const base64 = await FileSystem.readAsStringAsync(docFile.uri, {
        encoding: "base64",
      });
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, bytes, { contentType: docFile.mimeType ?? "application/octet-stream" });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("documents")
        .getPublicUrl(filePath);

      const { error: insertError } = await supabase.from("documents").insert({
        title: docTitle.trim(),
        category_id: docCategory,
        player_id: docPlayer || null,
        team1_id: docTeam1 || null,
        file_url: urlData.publicUrl,
        uploaded_by: user!.id,
      });

      if (insertError) throw insertError;
    },
    onSuccess: () => {
      Alert.alert("成功", "資料をアップロードしました");
      setDocTitle("");
      setDocPageType("");
      setDocCategory("");
      setDocPlayer("");
      setDocTeam1("");
      setDocFile(null);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => Alert.alert("エラー", e.message),
  });

  const uploadVideoMutation = useMutation({
    mutationFn: async () => {
      if (!videoTitle.trim()) throw new Error("タイトルを入力してください");
      if (!videoCategory) throw new Error("カテゴリを選択してください");
      if (!videoUrl.trim()) throw new Error("YouTube URLを入力してください");
      if (!videoUrl.includes("youtube.com") && !videoUrl.includes("youtu.be"))
        throw new Error("YouTubeのURLを入力してください");

      const { error } = await supabase.from("videos").insert({
        title: videoTitle.trim(),
        category_id: videoCategory,
        team1_id: videoTeam1 || null,
        team2_id: videoTeam2 || null,
        youtube_url: videoUrl.trim(),
        uploaded_by: user!.id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      Alert.alert("成功", "動画を登録しました");
      setVideoTitle("");
      setVideoPageType("");
      setVideoCategory("");
      setVideoTeam1("");
      setVideoTeam2("");
      setVideoUrl("");
      queryClient.invalidateQueries({ queryKey: ["videos"] });
    },
    onError: (e: Error) => Alert.alert("エラー", e.message),
  });

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/*", "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets[0]) {
      const file = result.assets[0];
      if (file.size && file.size > 20 * 1024 * 1024) {
        Alert.alert("エラー", "ファイルサイズは20MB以下にしてください");
        return;
      }
      setDocFile(file);
    }
  };

  if (!user) return <Redirect href="/login" />;
  if (!hasRole("analyst") && !hasRole("admin")) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Ionicons name="lock-closed-outline" size={48} color={colors.icon} />
        <Text style={[styles.noPermText, { color: colors.icon }]}>
          アナリスト以上の権限が必要です
        </Text>
      </View>
    );
  }

  const cardBg = colors.cardBg;
  const borderColor = colors.borderColor;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      {/* タブ切り替え */}
      <View style={[styles.tabBar, { backgroundColor: colorScheme === "dark" ? "#2c2c2e" : "#f3f4f6" }]}>
        {(["document", "video"] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.tab,
              activeTab === tab && { backgroundColor: colorScheme === "dark" ? "#3a3a3c" : "#fff" },
            ]}
            onPress={() => setActiveTab(tab)}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === tab ? colors.tint : colors.icon },
              ]}
            >
              {tab === "document" ? "資料をアップロード" : "動画を登録"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === "document" ? (
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="cloud-upload-outline" size={20} color={colors.tint} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              資料アップロード
            </Text>
          </View>
          <Text style={[styles.cardDesc, { color: colors.icon }]}>
            PDF、画像などをアップロードできます（最大20MB）
          </Text>

          {/* タイトル */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.text }]}>
              タイトル <Text style={{ color: "#ef4444" }}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor, backgroundColor: colorScheme === "dark" ? "#2c2c2e" : "#f9fafb" }]}
              value={docTitle}
              onChangeText={setDocTitle}
              placeholder="例：〇〇戦・打撃分析"
              placeholderTextColor={colors.icon}
              maxLength={200}
            />
          </View>

          {/* 投稿先 */}
          <SelectPicker
            label="投稿先"
            value={docPageType}
            placeholder="投稿先を選択"
            options={[
              { id: "documents", name: "資料ページ" },
              { id: "scores", name: "練習映像ページ" },
            ]}
            onSelect={(v) => { setDocPageType(v); setDocCategory(""); }}
            required
          />

          {/* カテゴリ */}
          <SelectPicker
            label="カテゴリ"
            value={docCategory}
            placeholder={docPageType ? "カテゴリを選択" : "先に投稿先を選択"}
            options={docCategories.map((c) => ({ id: c.id, name: c.name }))}
            onSelect={setDocCategory}
            disabled={!docPageType}
            required
          />

          {/* 選手 */}
          <SelectPicker
            label="選手（任意）"
            value={docPlayer}
            placeholder="選択なし"
            options={players?.map((p) => ({ id: p.id, name: p.name })) ?? []}
            onSelect={setDocPlayer}
          />

          {/* 対戦チーム */}
          <SelectPicker
            label="対戦チーム（任意）"
            value={docTeam1}
            placeholder="選択なし"
            options={opponents?.map((o) => ({ id: o.id, name: o.name })) ?? []}
            onSelect={setDocTeam1}
          />

          {/* ファイル選択 */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.text }]}>
              ファイル <Text style={{ color: "#ef4444" }}>*</Text>
            </Text>
            <TouchableOpacity
              style={[styles.filePicker, { borderColor, backgroundColor: colorScheme === "dark" ? "#2c2c2e" : "#f9fafb" }]}
              onPress={pickFile}
            >
              <Ionicons name="attach-outline" size={20} color={colors.tint} />
              <Text style={[styles.filePickerText, { color: docFile ? colors.text : colors.icon }]} numberOfLines={1}>
                {docFile ? docFile.name : "ファイルを選択"}
              </Text>
            </TouchableOpacity>
            {docFile && (
              <Text style={[styles.fileSize, { color: colors.icon }]}>
                {((docFile.size ?? 0) / 1024 / 1024).toFixed(2)} MB
              </Text>
            )}
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: colors.tint, opacity: uploadDocMutation.isPending ? 0.7 : 1 }]}
            onPress={() => uploadDocMutation.mutate()}
            disabled={uploadDocMutation.isPending}
          >
            {uploadDocMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
                <Text style={styles.submitBtnText}>アップロード</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="link-outline" size={20} color={colors.tint} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              動画登録
            </Text>
          </View>
          <Text style={[styles.cardDesc, { color: colors.icon }]}>
            YouTubeのリンクを登録できます
          </Text>

          {/* タイトル */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.text }]}>
              タイトル <Text style={{ color: "#ef4444" }}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor, backgroundColor: colorScheme === "dark" ? "#2c2c2e" : "#f9fafb" }]}
              value={videoTitle}
              onChangeText={setVideoTitle}
              placeholder="例：〇〇戦・守備練習"
              placeholderTextColor={colors.icon}
              maxLength={200}
            />
          </View>

          {/* 投稿先 */}
          <SelectPicker
            label="投稿先"
            value={videoPageType}
            placeholder="投稿先を選択"
            options={[
              { id: "videos", name: "試合映像ページ" },
              { id: "scores", name: "練習映像ページ" },
            ]}
            onSelect={(v) => { setVideoPageType(v); setVideoCategory(""); }}
            required
          />

          {/* カテゴリ */}
          <SelectPicker
            label="カテゴリ"
            value={videoCategory}
            placeholder={videoPageType ? "カテゴリを選択" : "先に投稿先を選択"}
            options={videoCategories.map((c) => ({ id: c.id, name: c.name }))}
            onSelect={setVideoCategory}
            disabled={!videoPageType}
            required
          />

          {/* チーム1 */}
          <SelectPicker
            label="対戦カード：チーム1（任意）"
            value={videoTeam1}
            placeholder="選択なし"
            options={opponents?.map((o) => ({ id: o.id, name: o.name })) ?? []}
            onSelect={setVideoTeam1}
          />

          {/* チーム2 */}
          <SelectPicker
            label="対戦カード：チーム2（任意）"
            value={videoTeam2}
            placeholder="選択なし"
            options={opponents?.map((o) => ({ id: o.id, name: o.name })) ?? []}
            onSelect={setVideoTeam2}
          />

          {/* YouTube URL */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.text }]}>
              YouTube URL <Text style={{ color: "#ef4444" }}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor, backgroundColor: colorScheme === "dark" ? "#2c2c2e" : "#f9fafb" }]}
              value={videoUrl}
              onChangeText={setVideoUrl}
              placeholder="https://www.youtube.com/watch?v=..."
              placeholderTextColor={colors.icon}
              autoCapitalize="none"
              keyboardType="url"
            />
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: colors.tint, opacity: uploadVideoMutation.isPending ? 0.7 : 1 }]}
            onPress={() => uploadVideoMutation.mutate()}
            disabled={uploadVideoMutation.isPending}
          >
            {uploadVideoMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={18} color="#fff" />
                <Text style={styles.submitBtnText}>登録</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16 },
  noPermText: { fontSize: 15 },
  tabBar: {
    flexDirection: "row",
    borderRadius: 10,
    padding: 3,
    gap: 2,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
  },
  tabText: { fontSize: 13, fontWeight: "600" },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: "600" },
  cardDesc: { fontSize: 13 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: "500" },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  selectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectBtnText: { fontSize: 15, flex: 1 },
  filePicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  filePickerText: { fontSize: 14, flex: 1 },
  fileSize: { fontSize: 12 },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: 10,
    marginTop: 4,
  },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)" },
  modalSheet: {
    maxHeight: "60%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
  },
  modalTitle: { fontSize: 16, fontWeight: "600", marginBottom: 12 },
  modalItem: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "transparent",
  },
  modalItemText: { fontSize: 15 },
});
