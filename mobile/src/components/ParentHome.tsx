import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { formatBs, useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import type { Child, ChildProfile, SchoolNote } from "@/lib/types";
import { useCachedFetch } from "@/lib/use-cached";
import { Card, colors } from "./ui";

/** How each school year ended (the current year shows the roll number instead) */
const YEAR_STATUS: Partial<Record<string, "yearPromoted" | "yearDetained" | "yearGraduated" | "yearCompleted">> = {
  PROMOTED: "yearPromoted",
  DETAINED: "yearDetained",
  GRADUATED: "yearGraduated",
  COMPLETED: "yearCompleted",
};

/** Photo-and-name chips to switch child. Shown only to parents with more than one child. */
export function ChildSwitcher() {
  const { children, selectedChild, selectChild } = useSession();
  if (children.length < 2) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {children.map((child) => {
        const active = child.id === selectedChild?.id;
        return (
          <Pressable
            key={child.id}
            onPress={() => selectChild(child.id)}
            style={[styles.chip, active && styles.chipActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Avatar child={child} size={32} light={active} />
            <Text style={[styles.chipText, active && { color: colors.white }]}>{child.fullName.split(" ")[0]}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function Avatar({ child, size, light }: { child: Child; size: number; light?: boolean }) {
  if (child.photoUrl) return <Image source={{ uri: child.photoUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={[styles.initials, { width: size, height: size, borderRadius: size / 2 }, light && { backgroundColor: "rgba(255,255,255,0.25)" }]}>
      <Text style={{ color: light ? colors.white : colors.brand, fontSize: size * 0.36, fontWeight: "700" }}>
        {child.fullName.split(" ").map((p) => p[0]).slice(0, 2).join("")}
      </Text>
    </View>
  );
}

interface AttendanceSummary {
  percent: number | null;
  totals: { total: number; absent: number };
}
interface ResultSummary {
  examName: string;
  gpa: number | null;
  grade: string;
  result: "PASS" | "FAIL" | "INCOMPLETE";
}

/** The selected child: who they are, this year at a glance, school years and parents. */
export function ParentHome() {
  const { t } = useI18n();
  const { children, selectedChild } = useSession();
  if (!children.length) {
    return (
      <Card>
        <Text style={styles.body}>{t("notLinked")}</Text>
      </Card>
    );
  }
  return (
    <>
      <ChildSwitcher />
      {selectedChild && <ChildSummary key={selectedChild.id} child={selectedChild} />}
    </>
  );
}

function ChildSummary({ child }: { child: Child }) {
  const { t, language } = useI18n();
  const base = `/my/children/${child.id}`;
  const { data: profile, offline } = useCachedFetch<ChildProfile>(base);
  const { data: attendance } = useCachedFetch<AttendanceSummary>(`${base}/attendance`);
  const { data: results } = useCachedFetch<ResultSummary[]>(`${base}/results`);
  const { data: notes } = useCachedFetch<SchoolNote[]>(`${base}/notes`);
  const latest = results?.[0];
  const lowAttendance = (attendance?.percent ?? 100) < 75;
  const history = profile?.history ?? [];

  return (
    <>
      {offline && <Text style={styles.offline}>{t("offline")}</Text>}

      <Card style={styles.childCard}>
        <Avatar child={child} size={64} />
        <View style={{ flex: 1 }}>
          <Text style={styles.childName}>{child.fullName}</Text>
          <Text style={styles.body}>
            {child.classSection ?? "—"} · {t("roll")} {child.rollNo ?? "—"}
          </Text>
          <Text style={styles.muted}>
            {t("admissionNo")} {child.admissionNo}
          </Text>
        </View>
      </Card>

      <View style={styles.grid}>
        <Tile icon="calendar-outline" title={t("attendance")} onPress={() => router.push("/attendance")}>
          {attendance && attendance.totals.total > 0 ? (
            <>
              <Text style={[styles.tileValue, lowAttendance && { color: colors.danger }]}>{attendance.percent}%</Text>
              <Text style={styles.tileNote}>{t("thisYear")} · {attendance.totals.absent} {t("absent").toLowerCase()}</Text>
            </>
          ) : (
            <Text style={styles.tileNote}>{t("noneYet")}</Text>
          )}
        </Tile>
        <Tile icon="trophy-outline" title={t("results")} onPress={() => router.push("/results")}>
          {latest ? (
            <>
              <Text style={[styles.tileValue, latest.result === "FAIL" && { color: colors.danger }]}>{latest.gpa !== null ? `GPA ${latest.gpa}` : latest.grade}</Text>
              <Text style={styles.tileNote} numberOfLines={1}>{latest.examName}</Text>
            </>
          ) : (
            <Text style={styles.tileNote}>{t("noneYet")}</Text>
          )}
        </Tile>
        <Tile icon="ribbon-outline" title={t("notes")} onPress={() => router.push("/notes")} wide>
          {notes?.length ? (
            <>
              <Text style={styles.noteTitle} numberOfLines={2}>{notes[0].title}</Text>
              <Text style={styles.tileNote}>{t("newNotes").replace("{count}", String(notes.length))} · {notes[0].dateBs}</Text>
            </>
          ) : (
            <Text style={styles.tileNote}>{t("noneYet")}</Text>
          )}
        </Tile>
      </View>
      <Text style={styles.coming}>{t("moreComing")}</Text>

      {history.length > 1 && (
        <Card style={{ gap: 12 }}>
          <Text style={styles.sectionTitle}>{t("schoolYears")}</Text>
          {history.map((h) => (
            <Row key={h.id} label={`${h.academicYear} · ${h.classSection}`} value={YEAR_STATUS[h.status] ? t(YEAR_STATUS[h.status]!) : `${t("roll")} ${h.rollNo ?? "—"}`} />
          ))}
        </Card>
      )}

      {profile && (
        <Card style={{ gap: 12 }}>
          <Row label={t("dateOfBirth")} value={`${formatBs(profile.dateOfBirth, language)} BS`} />
          <Row label={t("bloodGroup")} value={profile.bloodGroup ?? "—"} />
        </Card>
      )}

      {profile && (
        <Card style={{ gap: 14 }}>
          <Text style={styles.sectionTitle}>{t("parents")}</Text>
          {profile.guardians.map((g) => (
            <View key={g.id}>
              <Text style={styles.strong}>
                {g.fullName} {g.isPrimary ? `· ${t("primary")}` : ""}
              </Text>
              <Text style={styles.muted}>
                {g.phone ?? "—"}
                {g.whatsappOptIn ? ` · ${t("whatsapp")}` : ""}
              </Text>
            </View>
          ))}
        </Card>
      )}
    </>
  );
}

function Tile({ icon, title, onPress, wide, children }: { icon: keyof typeof Ionicons.glyphMap; title: string; onPress: () => void; wide?: boolean; children: ReactNode }) {
  return (
    <Pressable style={({ pressed }) => [styles.tile, wide && { flexBasis: "100%" }, pressed && { opacity: 0.7 }]} onPress={onPress} accessibilityRole="button" accessibilityLabel={title}>
      <View style={styles.tileHeader}>
        <Ionicons name={icon} size={22} color={colors.brand} />
        <Text style={styles.tileTitle}>{title}</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} style={{ marginLeft: "auto" }} />
      </View>
      {children}
    </Pressable>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <Text style={styles.body}>{label}</Text>
      <Text style={[styles.strong, { flexShrink: 1, textAlign: "right" }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  offline: { backgroundColor: "#fffbeb", color: "#92400e", padding: 12, borderRadius: 12, fontSize: 15 },
  chip: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 6, paddingRight: 16, height: 48, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontWeight: "600", color: colors.text, fontSize: 16 },
  initials: { backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center" },
  childCard: { flexDirection: "row", gap: 14, alignItems: "center" },
  childName: { fontSize: 20, fontWeight: "700", color: colors.text },
  body: { color: colors.text, fontSize: 16 },
  strong: { color: colors.text, fontSize: 16, fontWeight: "600" },
  muted: { color: colors.muted, fontSize: 15 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: { flexBasis: "46%", flexGrow: 1, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 4, minHeight: 112 },
  tileHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  tileTitle: { fontWeight: "600", color: colors.text, fontSize: 16 },
  tileValue: { fontSize: 26, fontWeight: "800", color: colors.text },
  noteTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  tileNote: { color: colors.muted, fontSize: 14 },
  coming: { color: colors.muted, fontSize: 14, textAlign: "center" },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
});
