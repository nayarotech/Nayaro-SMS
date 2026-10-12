import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useI18n } from "@/lib/i18n";
import type { MySheet, MySheets } from "@/lib/types";
import { useCachedFetch } from "@/lib/use-cached";
import { Card, colors } from "./ui";

type StatusKey = "sheetDraft" | "sheetReturned" | "sheetSubmitted" | "sheetVerified" | "sheetPublished";

function sheetState(sheet: MySheet): { key: StatusKey; color: string; soft: string; icon: keyof typeof Ionicons.glyphMap } {
  if (sheet.status === "DRAFT" && sheet.returnNote) return { key: "sheetReturned", color: "#b91c1c", soft: "#fee2e2", icon: "arrow-undo" };
  if (sheet.status === "DRAFT") return { key: "sheetDraft", color: "#b45309", soft: "#fef3c7", icon: "create-outline" };
  if (sheet.status === "SUBMITTED") return { key: "sheetSubmitted", color: "#1d4ed8", soft: "#dbeafe", icon: "paper-plane-outline" };
  if (sheet.status === "VERIFIED") return { key: "sheetVerified", color: "#15803d", soft: "#dcfce7", icon: "checkmark-circle-outline" };
  return { key: "sheetPublished", color: "#15803d", soft: "#dcfce7", icon: "megaphone-outline" };
}

/** One subject × section in an exam, with how far marks entry has got. */
export function SheetCard({ examId, examName, sheet }: { examId: string; examName?: string; sheet: MySheet }) {
  const { t } = useI18n();
  const state = sheetState(sheet);
  const progress = sheet.students ? Math.min(1, sheet.entered / sheet.students) : 0;
  return (
    <Pressable onPress={() => router.push(`/marks/${examId}/${sheet.sectionId}/${sheet.subjectId}`)} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      <Card style={styles.card}>
        <View style={[styles.icon, { backgroundColor: state.soft }]}>
          <Ionicons name={state.icon} size={22} color={state.color} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.title} numberOfLines={1}>{sheet.subjectName} · {sheet.className} {sheet.sectionName}</Text>
          {examName ? <Text style={styles.muted} numberOfLines={1}>{examName}</Text> : null}
          <View style={styles.statusRow}>
            <Text style={[styles.status, { color: state.color }]}>{t(state.key)}</Text>
            {sheet.status === "DRAFT" && (
              <Text style={styles.muted}>· {sheet.entered}/{sheet.students} {t("entered")}</Text>
            )}
          </View>
          {sheet.status === "DRAFT" && (
            <View style={styles.bar}>
              <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: state.color }]} />
            </View>
          )}
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.muted} />
      </Card>
    </Pressable>
  );
}

/** Teacher home: mark sheets still waiting for this teacher (not submitted, or sent back). */
export function TeacherMarks() {
  const { t } = useI18n();
  const { data, reload } = useCachedFetch<MySheets>("/exams/my-sheets");
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  if (!data?.exams.length) return null;

  const pending = data.exams.flatMap((exam) => exam.sheets.filter((s) => s.status === "DRAFT").map((sheet) => ({ exam, sheet })));
  // Sent-back sheets first: someone is waiting for them
  pending.sort((a, b) => Number(Boolean(b.sheet.returnNote)) - Number(Boolean(a.sheet.returnNote)));

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.headingRow}>
        <Text style={styles.heading}>{t("marksToEnter")}</Text>
        <Pressable onPress={() => router.push("/marks")} hitSlop={8}>
          <Text style={styles.link}>{t("seeAll")}</Text>
        </Pressable>
      </View>
      {pending.length === 0 ? (
        <View style={styles.done}>
          <Ionicons name="checkmark-done" size={18} color="#15803d" />
          <Text style={{ color: "#166534", fontWeight: "600", flex: 1 }}>{t("allMarksDone")}</Text>
        </View>
      ) : (
        pending.slice(0, 4).map(({ exam, sheet }) => <SheetCard key={`${exam.id}:${sheet.sectionId}:${sheet.subjectId}`} examId={exam.id} examName={exam.name} sheet={sheet} />)
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 14 },
  icon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontWeight: "700", color: colors.text },
  muted: { color: colors.muted, fontSize: 15 },
  statusRow: { flexDirection: "row", gap: 4, alignItems: "center" },
  status: { fontSize: 14, fontWeight: "700" },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden", marginTop: 2 },
  fill: { height: 6, borderRadius: 3 },
  headingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heading: { fontSize: 16, fontWeight: "700", color: colors.text },
  link: { color: colors.brand, fontWeight: "600" },
  done: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, backgroundColor: "#f0fdf4" },
});
