import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { todayInNepal } from "@/lib/dates";
import { formatBs, useI18n } from "@/lib/i18n";
import { useCachedFetch } from "@/lib/use-cached";
import { Card, colors } from "./ui";

interface MySection {
  sectionId: string;
  label: string;
  role: "class_teacher" | "proxy" | "admin";
  students: number;
  taken: boolean;
  summary: { present: number; absent: number; late: number; leave: number } | null;
}

/** Teacher home: today's sections to take attendance for. */
export function TeacherClasses({ canSeeAll }: { canSeeAll: boolean }) {
  const { t, language } = useI18n();
  const [today] = useState(todayInNepal);
  const { data, reload } = useCachedFetch<MySection[]>("/attendance/my-sections");

  // Refresh when coming back from taking attendance
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const own = data?.filter((s) => s.role !== "admin") ?? [];
  const sections = own.length || !canSeeAll ? own : (data ?? []);
  const left = sections.filter((s) => !s.taken).length;

  return (
    <View style={{ gap: 10 }}>
      <View>
        <Text style={styles.heading}>{t("takeAttendance")}</Text>
        <Text style={styles.muted}>{t("today")} · {formatBs(today, language)}</Text>
      </View>
      {sections.length > 0 && (
        <View style={[styles.progress, left === 0 && { backgroundColor: "#f0fdf4" }]}>
          <Ionicons name={left === 0 ? "checkmark-done" : "time-outline"} size={18} color={left === 0 ? "#15803d" : "#b45309"} />
          <Text style={{ color: left === 0 ? "#166534" : "#92400e", fontWeight: "600", flex: 1 }}>
            {left === 0 ? t("allDoneToday") : t("classesLeft").replace("{left}", String(left)).replace("{total}", String(sections.length))}
          </Text>
        </View>
      )}
      {data && sections.length === 0 && (
        <Card>
          <Text style={{ color: colors.muted }}>{t("nothingToday")}</Text>
        </Card>
      )}
      {sections.map((s) => (
        <Pressable key={s.sectionId} onPress={() => router.push(`/teach/${s.sectionId}`)} style={({ pressed }) => pressed && { opacity: 0.7 }}>
          <Card style={styles.card}>
            <View style={[styles.icon, { backgroundColor: s.taken ? "#dcfce7" : "#fef3c7" }]}>
              <Ionicons name={s.taken ? "checkmark-circle" : "time-outline"} size={24} color={s.taken ? "#15803d" : "#b45309"} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>
                {s.label}
                {s.role === "proxy" ? `  ·  ${t("proxy")}` : ""}
              </Text>
              <Text style={styles.muted}>
                {s.taken && s.summary
                  ? `${s.summary.present + s.summary.late} ${t("present").toLowerCase()} · ${s.summary.absent} ${t("absent").toLowerCase()}`
                  : `${t("notTaken")} · ${s.students} ${t("students")}`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </Card>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, backgroundColor: "#fffbeb" },
  heading: { fontSize: 16, fontWeight: "700", color: colors.text },
  card: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 16, fontWeight: "700", color: colors.text },
  muted: { color: colors.muted, fontSize: 15, marginTop: 2 },
});
