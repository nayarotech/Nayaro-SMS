import { StyleSheet, Text, View } from "react-native";
import { ChildSwitcher } from "@/components/ParentHome";
import { Screen } from "@/components/Screen";
import { Card, colors } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { useCachedFetch } from "@/lib/use-cached";

interface Counts {
  present: number;
  absent: number;
  late: number;
  leave: number;
  total: number;
}

interface ChildAttendance {
  academicYear: { name: string };
  totals: Counts;
  percent: number | null;
  months: { name: string; counts: Counts; percent: number | null }[];
  absences: { date: string; dateBs: string; status: "ABSENT" | "LEAVE"; remark: string | null }[];
}

/** The selected child's attendance this year. */
export default function AttendanceScreen() {
  const { t } = useI18n();
  const { selectedChild } = useSession();
  const { data, offline, loading, reload } = useCachedFetch<ChildAttendance>(selectedChild ? `/my/children/${selectedChild.id}/attendance` : null);
  const low = (data?.percent ?? 100) < 75;

  return (
    <Screen title={t("attendance")} subtitle={selectedChild?.fullName} tab onRefresh={reload} offline={offline} loading={loading && !data}>
      <ChildSwitcher />
      {!data || data.totals.total === 0 ? (
        <Card><Text style={styles.muted}>{t("noAttendance")}</Text></Card>
      ) : (
        <>
          <Card style={{ alignItems: "center", gap: 4 }}>
            <Text style={[styles.big, low && { color: colors.danger }]}>{data.percent}%</Text>
            <Text style={styles.muted}>
              {data.totals.present + data.totals.late}/{data.totals.total} {t("daysPresent")} · {data.academicYear.name}
            </Text>
            <View style={styles.row}>
              <Pill label={t("absent")} value={data.totals.absent} color={colors.danger} />
              <Pill label={t("late")} value={data.totals.late} color="#d97706" />
              <Pill label={t("leave")} value={data.totals.leave} color={colors.brand} />
            </View>
          </Card>

          <Card style={{ gap: 10 }}>
            <Text style={styles.section}>{t("byMonth")}</Text>
            {data.months.map((m) => (
              <View key={m.name} style={styles.month}>
                <Text style={[styles.muted, { width: 118 }]} numberOfLines={1}>{m.name}</Text>
                <View style={styles.bar}>
                  <View style={[styles.fill, { width: `${m.percent ?? 0}%`, backgroundColor: (m.percent ?? 100) < 75 ? colors.danger : colors.brand }]} />
                </View>
                <Text style={styles.percent}>{m.percent}%</Text>
              </View>
            ))}
          </Card>

          {data.absences.length > 0 && (
            <Card style={{ gap: 10 }}>
              <Text style={styles.section}>{t("daysMissed")}</Text>
              {[...data.absences].reverse().map((a) => (
                <View key={a.date} style={styles.absence}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text }}>{a.dateBs}</Text>
                    {a.remark ? <Text style={styles.muted}>{a.remark}</Text> : null}
                  </View>
                  <Text style={{ color: a.status === "ABSENT" ? colors.danger : colors.brand, fontWeight: "600" }}>{a.status === "ABSENT" ? t("absent") : t("leave")}</Text>
                </View>
              ))}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}

function Pill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.pill}>
      <Text style={{ color, fontWeight: "700", fontSize: 18 }}>{value}</Text>
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  big: { fontSize: 48, fontWeight: "800", color: colors.text },
  muted: { color: colors.muted, fontSize: 15 },
  row: { flexDirection: "row", gap: 10, marginTop: 10 },
  pill: { alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.background },
  section: { fontSize: 16, fontWeight: "700", color: colors.text },
  month: { flexDirection: "row", alignItems: "center", gap: 10 },
  bar: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4 },
  percent: { width: 52, textAlign: "right", fontWeight: "600", color: colors.text },
  absence: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
});
