import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Card, colors } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { clearUnread } from "@/lib/unread";
import { useCachedFetch } from "@/lib/use-cached";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  data: { studentId?: string } | null;
  createdAt: string;
}

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  "attendance.absent": "alert-circle",
  "results.published": "trophy",
  "attendance.proxy": "person-add",
  "marks.returned": "arrow-undo",
  "student.note": "ribbon",
  "promotion.promote": "trending-up",
  "promotion.detain": "repeat",
  "promotion.graduate": "school",
};

/** Where tapping a notification goes. */
const TARGET: Record<string, "/attendance" | "/results" | "/notes" | "/marks" | "/home"> = {
  "attendance.absent": "/attendance",
  "results.published": "/results",
  "student.note": "/notes",
  "marks.returned": "/marks",
  "attendance.proxy": "/home",
};

/** Alerts from the school: absences, published results… Opening the screen marks them read. */
export default function NotificationsScreen() {
  const { t } = useI18n();
  const { selectChild } = useSession();
  const { data, offline, loading, reload } = useCachedFetch<{ items: Notification[]; unread: number }>("/notifications?pageSize=50");
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  // Opening the inbox marks everything read (the highlight stays until the next visit)
  useEffect(() => {
    if (!data?.unread) return;
    void api.post("/notifications/read", {}).then(clearUnread).catch(() => undefined);
  }, [data?.unread]);

  const open = (n: Notification) => {
    const target = TARGET[n.type];
    if (!target) return;
    if (n.data?.studentId) selectChild(n.data.studentId);
    router.push(target);
  };

  return (
    <Screen title={t("notifications")} tab onRefresh={reload} offline={offline} loading={loading && !data}>
      {!data?.items.length ? (
        <Card><Text style={{ color: colors.muted }}>{t("noNotifications")}</Text></Card>
      ) : (
        data.items.map((n) => (
          <Pressable key={n.id} onPress={() => open(n)} disabled={!TARGET[n.type]} style={({ pressed }) => pressed && { opacity: 0.7 }}>
            <Card style={[styles.card, !n.readAt && styles.unread]}>
              <Ionicons name={ICONS[n.type] ?? "notifications"} size={26} color={n.type === "attendance.absent" ? colors.danger : colors.brand} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={styles.title}>{n.title}</Text>
                <Text style={styles.body}>{n.body}</Text>
                <Text style={styles.time}>{new Date(n.createdAt).toLocaleString()}</Text>
              </View>
              {TARGET[n.type] && <Ionicons name="chevron-forward" size={20} color={colors.muted} />}
            </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  unread: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  title: { fontSize: 17, fontWeight: "700", color: colors.text },
  body: { fontSize: 16, color: colors.text, lineHeight: 22 },
  time: { fontSize: 14, color: colors.muted, marginTop: 2 },
});
