import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChildSwitcher } from "@/components/ParentHome";
import { Screen } from "@/components/Screen";
import { Card, colors } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { useCachedFetch } from "@/lib/use-cached";

interface ResultSummary {
  examId: string;
  examName: string;
  academicYear: string;
  gpa: number | null;
  grade: string;
  result: "PASS" | "FAIL" | "INCOMPLETE";
  percentage: number;
  sectionRank: number | null;
}

/** Published exam results for the selected child. */
export default function ResultsScreen() {
  const { t } = useI18n();
  const { selectedChild } = useSession();
  const { data, offline, loading, reload } = useCachedFetch<ResultSummary[]>(selectedChild ? `/my/children/${selectedChild.id}/results` : null);

  return (
    <Screen title={t("results")} subtitle={selectedChild?.fullName} tab onRefresh={reload} offline={offline} loading={loading && !data}>
      <ChildSwitcher />
      {!data?.length ? (
        <Card><Text style={{ color: colors.muted }}>{t("noResults")}</Text></Card>
      ) : (
        data.map((r) => (
          <Pressable key={r.examId} onPress={() => router.push(`/results/${r.examId}`)}>
            <Card style={styles.card}>
              <View style={styles.gpa}>
                <Text style={styles.gpaValue}>{r.gpa ?? "—"}</Text>
                <Text style={styles.gpaLabel}>GPA</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.exam}>{r.examName}</Text>
                <Text style={styles.muted}>
                  {r.academicYear} · {t("grade")} {r.grade}
                  {r.sectionRank ? ` · ${t("rank")} ${r.sectionRank}` : ""}
                </Text>
                <Text style={[styles.result, { color: r.result === "PASS" ? "#15803d" : r.result === "FAIL" ? colors.danger : "#b45309" }]}>
                  {t(r.result === "PASS" ? "pass" : r.result === "FAIL" ? "fail" : "incomplete")}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 14 },
  gpa: { width: 64, height: 64, borderRadius: 16, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center" },
  gpaValue: { fontSize: 20, fontWeight: "800", color: colors.brand },
  gpaLabel: { fontSize: 13, color: colors.brand },
  exam: { fontSize: 16, fontWeight: "700", color: colors.text },
  muted: { color: colors.muted, fontSize: 15 },
  result: { fontWeight: "700", marginTop: 2 },
});
