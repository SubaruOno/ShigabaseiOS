import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
} from "react-native";
import { useState, useEffect, useRef } from "react";
import { useLocalSearchParams, useNavigation, Redirect } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import * as DocumentPicker from "expo-document-picker";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ChatScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const queryClient = useQueryClient();
  const navigation = useNavigation();
  const [newMessage, setNewMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [fileUrls, setFileUrls] = useState<Map<string, string>>(new Map());
  const flatListRef = useRef<FlatList>(null);

  const { data: conversation } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("user1_id, user2_id")
        .eq("id", conversationId)
        .single();
      if (error) throw error;

      const otherId =
        data.user1_id === user!.id ? data.user2_id : data.user1_id;
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", otherId)
        .single();

      return {
        ...data,
        otherUserName: profile?.display_name ?? "不明",
        otherId,
      };
    },
    enabled: !!conversationId && !!user,
  });

  const { data: messages, isLoading } = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!conversationId,
  });

  const sendMutation = useMutation({
    mutationFn: async ({
      content,
      file,
    }: {
      content: string;
      file: DocumentPicker.DocumentPickerAsset | null;
    }) => {
      let fileUrl = null;
      let fileName = null;
      let fileType = null;
      let fileSize = null;

      if (file) {
        const ext = file.name.split(".").pop();
        const filePath = `${conversationId}/${Date.now()}.${ext}`;

        const blob = await new Promise<Blob>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.onload = () => resolve(xhr.response);
          xhr.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));
          xhr.responseType = "blob";
          xhr.open("GET", file.uri, true);
          xhr.send(null);
        });

        const { error: uploadError } = await supabase.storage
          .from("dm-attachments")
          .upload(filePath, blob, {
            contentType: file.mimeType ?? "application/octet-stream",
          });

        if (uploadError) throw uploadError;

        fileUrl = filePath;
        fileName = file.name;
        fileType = file.mimeType;
        fileSize = file.size;
      }

      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user!.id,
        content: content || (file ? `📎 ${file.name}` : ""),
        file_url: fileUrl,
        file_name: fileName,
        file_type: fileType,
        file_size: fileSize,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewMessage("");
      setSelectedFile(null);
      queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      // Fire-and-forget push notification to recipient
      supabase.functions
        .invoke("send-push-notification", {
          body: { type: "dm", conversationId, senderId: user!.id },
        })
        .catch(() => {});
    },
    onError: () => {
      Alert.alert("エラー", "メッセージの送信に失敗しました");
    },
  });

  // 署名付きURLを取得
  useEffect(() => {
    if (!messages) return;
    const fetch = async () => {
      const newUrls = new Map<string, string>();
      for (const msg of messages) {
        if (msg.file_url && !fileUrls.has(msg.file_url)) {
          const { data } = await supabase.storage
            .from("dm-attachments")
            .createSignedUrl(msg.file_url, 3600);
          if (data) newUrls.set(msg.file_url, data.signedUrl);
        }
      }
      if (newUrls.size > 0) {
        setFileUrls((prev) => new Map([...prev, ...newUrls]));
      }
    };
    fetch();
    // fileUrls は意図的に依存配列から除外（無限ループ防止）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // タイトル設定
  useEffect(() => {
    if (conversation?.otherUserName) {
      navigation.setOptions({ title: conversation.otherUserName });
    }
  }, [conversation?.otherUserName, navigation]);

  // Realtime
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: ["messages", conversationId],
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  // 既読処理
  useEffect(() => {
    if (!messages || !user?.id) return;
    const unread = messages.filter(
      (m) => !m.is_read && m.sender_id !== user.id
    );
    if (unread.length === 0) return;
    supabase
      .from("messages")
      .update({ is_read: true })
      .in("id", unread.map((m) => m.id))
      .neq("sender_id", user.id)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      });
  }, [messages, user?.id, queryClient]);

  // 自動スクロール
  useEffect(() => {
    if (messages && messages.length > 0) {
      setTimeout(
        () => flatListRef.current?.scrollToEnd({ animated: false }),
        100
      );
    }
  }, [messages]);

  if (!user) return <Redirect href="/login" />;

  const handleSend = () => {
    if (!newMessage.trim() && !selectedFile) return;
    sendMutation.mutate({ content: newMessage, file: selectedFile });
  };

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["image/*", "application/pdf", "*/*"],
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets[0]) {
      const file = result.assets[0];
      if (file.size && file.size > 20 * 1024 * 1024) {
        Alert.alert("エラー", "20MB以下のファイルを選択してください");
        return;
      }
      setSelectedFile(file);
    }
  };

  const cardBg = colors.cardBg;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={headerHeight}
    >
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
          removeClippedSubviews={true}
          maxToRenderPerBatch={20}
          updateCellsBatchingPeriod={50}
          initialNumToRender={30}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: false })
          }
          renderItem={({ item }) => {
            const isMine = item.sender_id === user.id;
            const isImage = item.file_type?.startsWith("image/");
            const signedUrl = item.file_url ? fileUrls.get(item.file_url) : null;

            return (
              <View
                style={[
                  styles.messageRow,
                  isMine ? styles.messageRowRight : styles.messageRowLeft,
                ]}
              >
                <View
                  style={[
                    styles.bubble,
                    isMine
                      ? [styles.bubbleMine, { backgroundColor: colors.tint }]
                      : [
                          styles.bubbleOther,
                          {
                            backgroundColor:
                              colorScheme === "dark" ? "#2c2c2e" : "#f0f0f0",
                          },
                        ],
                  ]}
                >
                  {item.content && !item.file_url ? (
                    <Text
                      style={[
                        styles.bubbleText,
                        { color: isMine ? "#fff" : colors.text },
                      ]}
                    >
                      {item.content}
                    </Text>
                  ) : null}

                  {item.file_url && signedUrl ? (
                    isImage ? (
                      <Image
                        source={{ uri: signedUrl }}
                        style={styles.imageAttachment}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.fileAttachment}>
                        <Ionicons
                          name="document-outline"
                          size={20}
                          color={isMine ? "#fff" : colors.tint}
                        />
                        <Text
                          style={[
                            styles.fileAttachmentText,
                            { color: isMine ? "#fff" : colors.text },
                          ]}
                          numberOfLines={2}
                        >
                          {item.file_name ?? "ファイル"}
                        </Text>
                      </View>
                    )
                  ) : item.file_url && !signedUrl ? (
                    <View style={styles.fileAttachment}>
                      <Ionicons
                        name="document-outline"
                        size={20}
                        color={isMine ? "#fff" : colors.tint}
                      />
                      <Text
                        style={[
                          styles.fileAttachmentText,
                          { color: isMine ? "#fff" : colors.text },
                        ]}
                      >
                        {item.file_name ?? "ファイル"}
                      </Text>
                    </View>
                  ) : null}

                  <Text
                    style={[
                      styles.timeText,
                      {
                        color: isMine
                          ? "rgba(255,255,255,0.7)"
                          : colors.icon,
                      },
                    ]}
                  >
                    {formatTime(item.created_at)}
                  </Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: colors.icon }]}>
                メッセージを送信して会話を始めましょう
              </Text>
            </View>
          }
        />
      )}

      {/* 選択中のファイルプレビュー */}
      {selectedFile && (
        <View
          style={[
            styles.filePreview,
            {
              backgroundColor: colorScheme === "dark" ? "#2c2c2e" : "#f5f5f5",
              borderTopColor: colorScheme === "dark" ? "#38383a" : "#e5e7eb",
            },
          ]}
        >
          <Ionicons name="document-outline" size={20} color={colors.tint} />
          <Text
            style={[styles.filePreviewText, { color: colors.text }]}
            numberOfLines={1}
          >
            {selectedFile.name}
          </Text>
          <TouchableOpacity onPress={() => setSelectedFile(null)}>
            <Ionicons name="close-circle" size={20} color={colors.icon} />
          </TouchableOpacity>
        </View>
      )}

      {/* 入力欄 */}
      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: cardBg,
            borderTopColor:
              colorScheme === "dark" ? "#38383a" : "#e5e7eb",
            paddingBottom: insets.bottom + 8,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.attachBtn}
          onPress={pickFile}
          disabled={sendMutation.isPending}
        >
          <Ionicons name="attach" size={24} color={colors.icon} />
        </TouchableOpacity>

        <TextInput
          style={[
            styles.input,
            {
              color: colors.text,
              backgroundColor:
                colorScheme === "dark" ? "#2c2c2e" : "#f5f5f5",
            },
          ]}
          value={newMessage}
          onChangeText={setNewMessage}
          placeholder="メッセージを入力..."
          placeholderTextColor={colors.icon}
          multiline
          returnKeyType="send"
        />
        <TouchableOpacity
          style={[
            styles.sendBtn,
            {
              backgroundColor:
                newMessage.trim() || selectedFile ? colors.tint : colors.icon,
            },
          ]}
          onPress={handleSend}
          disabled={
            (!newMessage.trim() && !selectedFile) || sendMutation.isPending
          }
        >
          {sendMutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={18} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  messageList: { padding: 12, flexGrow: 1 },
  messageRow: { marginBottom: 8, flexDirection: "row" },
  messageRowRight: { justifyContent: "flex-end" },
  messageRowLeft: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "75%",
    borderRadius: 16,
    padding: 10,
  },
  bubbleMine: { borderBottomRightRadius: 4 },
  bubbleOther: { borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  imageAttachment: {
    width: 200,
    height: 150,
    borderRadius: 8,
    marginBottom: 4,
  },
  fileAttachment: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  fileAttachmentText: { fontSize: 13, flex: 1 },
  timeText: { fontSize: 11, marginTop: 2 },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 80,
  },
  emptyText: { fontSize: 14 },
  filePreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  filePreviewText: { flex: 1, fontSize: 13 },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 8,
    borderTopWidth: 1,
    gap: 6,
  },
  attachBtn: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  input: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
});
