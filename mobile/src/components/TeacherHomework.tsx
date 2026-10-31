import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatBs, useI18n } from "@/lib/i18n";
import type { TeacherHomework as Homework } from "@/lib/types";
import { useCachedFetch } from "@/lib/use-cached";
import { Card, colors } from "./ui";

/** Teacher home: post homework or materials, and check recent homework. */
export function TeacherHomework({ canAddMaterial }: { canAddMaterial: boolean }) {
  const { t, language } = useI18n();
  const { data, reload } = useCachedFetch<{ items: Homework[] }>("/homework?mine=true&pageSize=5");
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.heading}>{t("homework")}</Text>
      <View style={styles.actions}>
        <Action icon="create-outline" label={t("postHomework")} onPress={() => router.push("/homework/new")} />
        {canAddMaterial && <Action icon="library-outline" label={t("addMaterial")} onPress={() => router.push("/materials/new")} />}
      </View>
      {data?.items.map((h) => {
        const done = h.students !== undefined && h.students > 0 && h.checked >= h.students;
        return (
          <Pressable key={h.id} onPress={() => router.push(`/homework/${h.id}`)} style={({ pressed }) => pressed && { opacity: 0.7 }}>
            <Card style={styles.card}>
              <View style={[styles.icon, { backgroundColor: done ? "#dcfce7" : colors.brandSoft }]}>
                <Ionicons name={done ? "checkmark-done" : "book-outline"} size={22} color={done ? "#15803d" : colors.brand} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.title} numberOfLines={1}>{h.title}</Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {h.subject.name} · {h.section.className} {h.section.name} · {t("due")} {formatBs(h.dueDate, language)}
                </Text>
                {h.students !== undefined && <Text style={styles.muted}>{h.checked}/{h.students} {t("checked")}</Text>}
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </Card>
          </Pressable>
        );
      })}
    </View>
  );
}

function Action({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]} accessibilityRole="button">
      <Ionicons name={icon} size={22} color={colors.white} />
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 18, fontWeight: "700", color: colors.text },
  actions: { flexDirection: "row", gap: 10 },
  action: { flex: 1, minHeight: 52, borderRadius: 14, backgroundColor: colors.brand, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 12 },
  actionText: { color: colors.white, fontWeight: "700", fontSize: 16 },
  card: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontWeight: "700", color: colors.text },
  muted: { color: colors.muted, fontSize: 15 },
});
