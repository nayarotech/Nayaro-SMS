import { useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Card, colors } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { useCachedFetch } from "@/lib/use-cached";

interface SubjectResult {
  subjectId: string;
  subjectName: string;
  fullMarks: number;
  theory: number | null;
  practical: number | null;
  obtained: number | null;
  grade: string;
  gradePoint: number | null;
  outcome: string;
}

interface ResultDetail {
  exam: { name: string; academicYear: string };
  student: {
    name: string;
    sectionRank: number | null;
    remark: string | null;
    result: { subjects: SubjectResult[]; totalObtained: number; totalFull: number; percentage: number; gpa: number | null; grade: string; result: "PASS" | "FAIL" | "INCOMPLETE" };
  };
}

/** One exam's full result: every subject's marks and grade, GPA, rank and the teacher's remark. */
export default function ResultDetailScreen() {
  const { examId } = useLocalSearchParams<{ examId: string }>();
  const { t } = useI18n();
  const { selectedChild } = useSession();
  const { data, offline, loading, reload } = useCachedFetch<ResultDetail>(selectedChild ? `/my/children/${selectedChild.id}/results/${examId}` : null);
  const r = data?.student.result;

  return (
    <Screen title={data?.exam.name ?? t("results")} subtitle={selectedChild?.fullName} onRefresh={reload} offline={offline} loading={loading && !data}>
      {r && data && (
        <>
          <Card style={styles.summary}>
            <Summary label="GPA" value={String(r.gpa ?? "—")} />
            <Summary label={t("grade")} value={r.grade} />
            <Summary label="%" value={String(r.percentage)} />
            {data.student.sectionRank ? <Summary label={t("rank")} value={String(data.student.sectionRank)} /> : null}
          </Card>
          <Text style={[styles.result, { color: r.result === "PASS" ? "#15803d" : r.result === "FAIL" ? colors.danger : "#b45309" }]}>
            {t(r.result === "PASS" ? "pass" : r.result === "FAIL" ? "fail" : "incomplete")} · {r.totalObtained}/{r.totalFull}
          </Text>

          <Card style={{ paddingVertical: 4 }}>
            {r.subjects.map((s, i) => (
              <View key={s.subjectId} style={[styles.subject, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.subjectName}>{s.subjectName}</Text>
                  <Text style={styles.muted}>
                    {s.outcome === "ABSENT" ? t("absent") : s.practical !== null ? `${s.theory} + ${s.practical}` : `${s.obtained ?? "—"}`} / {s.fullMarks}
                  </Text>
                </View>
                <Text style={[styles.grade, (s.outcome === "FAIL" || s.outcome === "ABSENT") && { color: colors.danger }]}>{s.grade}</Text>
              </View>
            ))}
          </Card>

          {data.student.remark ? (
            <Card style={{ gap: 4 }}>
              <Text style={styles.subjectName}>{t("teacherRemark")}</Text>
              <Text style={{ color: colors.text, fontSize: 15 }}>{data.student.remark}</Text>
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={{ fontSize: 24, fontWeight: "800", color: colors.text }}>{value}</Text>
      <Text style={{ color: colors.muted, fontSize: 14 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: "row", justifyContent: "space-around" },
  result: { textAlign: "center", fontWeight: "700", fontSize: 15 },
  subject: { flexDirection: "row", alignItems: "center", paddingVertical: 12 },
  subjectName: { fontSize: 15, fontWeight: "600", color: colors.text },
  muted: { color: colors.muted, fontSize: 15, marginTop: 2 },
  grade: { fontSize: 18, fontWeight: "800", color: colors.brand, minWidth: 40, textAlign: "right" },
});
