import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Button, Card, colors, confirmAction } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cache } from "@/lib/storage";
import type { GradeBand, SheetStatus } from "@/lib/types";
import { useCachedFetch } from "@/lib/use-cached";

type MarkStatus = "PRESENT" | "ABSENT" | "MEDICAL";

interface Sheet {
  exam: { id: string; name: string };
  section: { id: string; label: string };
  subject: { id: string; name: string; theoryFullMarks: number; theoryPassMarks: number; practicalFullMarks: number; practicalPassMarks: number };
  status: SheetStatus;
  returnNote: string | null;
  access: { canEdit: boolean; canSubmit: boolean; reason: string | null };
  students: { studentId: string; name: string; rollNo: number | null; theory: number | null; practical: number | null; status: MarkStatus }[];
  updatedAt: string | null;
}

/** What the teacher has typed: kept as text so "4" on the way to "45" isn't rewritten. */
interface Row {
  theory: string;
  practical: string;
  status: MarkStatus;
}

type ParseError = "invalidNumber" | "tooHigh";

/** "" → null; otherwise a number between 0 and full with at most 2 decimals. */
function parseMark(text: string, full: number): { value: number | null; error?: ParseError } {
  const trimmed = text.trim().replace(",", ".");
  if (!trimmed) return { value: null };
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0 || Math.round(value * 100) !== value * 100) return { value: null, error: "invalidNumber" };
  if (value > full) return { value: null, error: "tooHigh" };
  return { value };
}

const toText = (value: number | null) => (value === null ? "" : String(value));

/** Mark entry for one subject in one section, made for a phone: numeric keypad, Next to move on, autosave. */
export default function MarkEntryScreen() {
  const { examId, sectionId, subjectId } = useLocalSearchParams<{ examId: string; sectionId: string; subjectId: string }>();
  const path = `/exams/${examId}/sheets/${sectionId}/${subjectId}`;
  const { data, offline, loading, error, reload } = useCachedFetch<Sheet>(path);
  const { data: bands } = useCachedFetch<GradeBand[]>("/exams/grading-scale");

  if (!data) {
    return (
      <Screen title="" loading={loading} onRefresh={reload} offline={offline}>
        <Card><Text style={styles.muted}>{error ?? ""}</Text></Card>
      </Screen>
    );
  }
  // A new status (e.g. after submitting) or newer marks from the server starts the form again
  return <Entry key={`${data.status}:${data.updatedAt}`} sheet={data} path={path} bands={bands ?? []} offline={offline} reload={reload} />;
}

function Entry({ sheet, path, bands, offline, reload }: { sheet: Sheet; path: string; bands: GradeBand[]; offline: boolean; reload: () => Promise<void> }) {
  const { t } = useI18n();
  const { subject } = sheet;
  const hasPractical = subject.practicalFullMarks > 0;
  const editable = sheet.access.canEdit;
  const draftKey = `marks-draft:${path}`;

  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(sheet.students.map((s) => [s.studentId, { theory: toText(s.theory), practical: toText(s.practical), status: s.status }])),
  );
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "offline" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const rowsRef = useRef(rows);
  const dirtyRef = useRef(dirty);
  const inputs = useRef<(TextInput | null)[]>([]);

  const update = (studentId: string, change: Partial<Row>) => {
    const next = { ...rowsRef.current, [studentId]: { ...rowsRef.current[studentId], ...change } };
    const nextDirty = new Set(dirtyRef.current).add(studentId);
    rowsRef.current = next;
    dirtyRef.current = nextDirty;
    setRows(next);
    setDirty(nextDirty);
    // Keep unsent marks on the phone so nothing is lost if the app closes or the internet drops
    void cache.set(draftKey, Object.fromEntries([...nextDirty].map((id) => [id, next[id]])));
  };

  const errorFor = useCallback(
    (row: Row): ParseError | null => (row.status !== "PRESENT" ? null : (parseMark(row.theory, subject.theoryFullMarks).error ?? (hasPractical ? parseMark(row.practical, subject.practicalFullMarks).error : undefined) ?? null)),
    [hasPractical, subject.practicalFullMarks, subject.theoryFullMarks],
  );

  /** Send changed, valid rows. Rows typed while the request was out stay dirty. */
  const flush = useCallback(async () => {
    const sent = [...dirtyRef.current].map((id) => [id, rowsRef.current[id]] as const).filter(([, row]) => !errorFor(row));
    if (!sent.length) return;
    setSaveState("saving");
    try {
      await api.put(path, {
        marks: sent.map(([studentId, row]) => ({
          studentId,
          status: row.status,
          theory: row.status === "PRESENT" ? parseMark(row.theory, subject.theoryFullMarks).value : null,
          practical: row.status === "PRESENT" && hasPractical ? parseMark(row.practical, subject.practicalFullMarks).value : null,
        })),
      });
      const remaining = new Set(dirtyRef.current);
      for (const [id, row] of sent) if (rowsRef.current[id] === row) remaining.delete(id);
      dirtyRef.current = remaining;
      setDirty(remaining);
      await cache.set(draftKey, Object.fromEntries([...remaining].map((id) => [id, rowsRef.current[id]])));
      setSaveState("saved");
      setMessage(null);
    } catch (e) {
      if (e instanceof ApiError && e.code === "OFFLINE") setSaveState("offline");
      else {
        setSaveState("error");
        setMessage(e instanceof Error ? e.message : String(e));
      }
    }
  }, [draftKey, errorFor, hasPractical, path, subject.practicalFullMarks, subject.theoryFullMarks]);

  // Autosave a moment after typing stops; while offline, keep retrying
  useEffect(() => {
    if (!editable || !dirty.size) return;
    const timer = setTimeout(() => void flush(), saveState === "offline" ? 15_000 : 1200);
    return () => clearTimeout(timer);
  }, [dirty, editable, flush, saveState]);

  // Bring back marks typed earlier on this phone that never reached the server
  useEffect(() => {
    if (!editable) return;
    let active = true;
    void cache.get<Record<string, Row>>(draftKey).then((draft) => {
      if (!active || !draft) return;
      for (const [id, row] of Object.entries(draft)) if (rowsRef.current[id]) update(id, row);
    });
    return () => {
      active = false;
    };
    // Only when the form opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const complete = sheet.students.filter((s) => {
    const row = rows[s.studentId];
    if (row.status !== "PRESENT") return true;
    return !errorFor(row) && parseMark(row.theory, subject.theoryFullMarks).value !== null && (!hasPractical || parseMark(row.practical, subject.practicalFullMarks).value !== null);
  }).length;
  const allEntered = complete === sheet.students.length;

  const submit = async () => {
    if (!(await confirmAction(t("submitConfirm"), { ok: t("submitForChecking"), cancel: t("cancel") }))) return;
    setSubmitting(true);
    try {
      await flush();
      await api.post(`${path}/submit`);
      setMessage(t("submitted"));
      await cache.set(draftKey, {});
      await reload();
    } catch (e) {
      setMessage(e instanceof ApiError && e.code === "OFFLINE" ? t("savedOnPhone") : e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const savedText =
    saveState === "saving" ? t("saving") : saveState === "offline" ? t("savedOnPhone") : dirty.size ? "" : saveState === "saved" ? t("allSaved") : "";

  const footer = editable ? (
    <>
      <View style={styles.footerRow}>
        <Text style={styles.progress}>{complete}/{sheet.students.length} {t("entered")}</Text>
        {savedText ? <Text style={[styles.muted, saveState === "offline" && { color: "#b45309" }, { flex: 1, textAlign: "right" }]} numberOfLines={2}>{savedText}</Text> : null}
      </View>
      {message && <Text style={[styles.message, saveState === "error" && { color: colors.danger }]}>{message}</Text>}
      {sheet.access.canSubmit && (
        <Button title={allEntered ? t("submitForChecking") : t("enterAllToSubmit")} onPress={() => void submit()} loading={submitting} disabled={!allEntered || offline} />
      )}
    </>
  ) : null;

  // Input order for the keyboard's Next button: theory, practical, next student…
  let inputIndex = 0;

  return (
    <Screen title={`${subject.name} · ${sheet.section.label}`} subtitle={sheet.exam.name} onRefresh={editable ? undefined : reload} offline={offline} footer={footer}>
      {sheet.returnNote && sheet.status === "DRAFT" && (
        <View style={[styles.banner, { backgroundColor: "#fef2f2" }]}>
          <Ionicons name="arrow-undo" size={18} color="#b91c1c" />
          <Text style={{ color: "#991b1b", flex: 1 }}>
            <Text style={{ fontWeight: "700" }}>{t("sentBackNote")} </Text>
            {sheet.returnNote}
          </Text>
        </View>
      )}
      {!editable && (
        <View style={[styles.banner, { backgroundColor: "#f1f5f9" }]}>
          <Ionicons name="lock-closed-outline" size={18} color="#334155" />
          <Text style={{ color: "#334155", flex: 1 }}>{sheet.access.reason ?? t("marksLocked")}</Text>
        </View>
      )}

      <Card style={styles.info}>
        <Text style={styles.infoText}>
          {t("theory")}: <Text style={styles.bold}>{subject.theoryFullMarks}</Text> ({t("passMarks")} {subject.theoryPassMarks})
        </Text>
        {hasPractical && (
          <Text style={styles.infoText}>
            {t("practical")}: <Text style={styles.bold}>{subject.practicalFullMarks}</Text> ({t("passMarks")} {subject.practicalPassMarks})
          </Text>
        )}
        {editable && <Text style={styles.muted}>{t("tapAbsent")}</Text>}
      </Card>

      {sheet.students.map((student) => {
        const row = rows[student.studentId];
        const problem = errorFor(row);
        const theory = parseMark(row.theory, subject.theoryFullMarks).value;
        const practical = hasPractical ? parseMark(row.practical, subject.practicalFullMarks).value : 0;
        const filled = row.status === "PRESENT" && theory !== null && practical !== null && !problem;
        const below = filled && (theory! < subject.theoryPassMarks || (hasPractical && practical! < subject.practicalPassMarks));
        const grade = filled ? gradeOf(((theory! + practical!) / (subject.theoryFullMarks + subject.practicalFullMarks)) * 100, bands, below) : null;
        const theoryIndex = inputIndex++;
        const practicalIndex = hasPractical ? inputIndex++ : -1;
        const focusNext = (index: number) => inputs.current[index + 1]?.focus();

        return (
          <Card key={student.studentId} style={[styles.row, problem && { borderColor: colors.danger }, below && { borderColor: "#f59e0b" }]}>
            <View style={styles.person}>
              <View style={styles.roll}>
                <Text style={styles.rollText}>{student.rollNo ?? "–"}</Text>
              </View>
              <Text style={styles.name} numberOfLines={1}>{student.name}</Text>
              {grade && (
                <View style={[styles.grade, below && { backgroundColor: "#fef3c7" }]}>
                  <Text style={[styles.gradeText, below && { color: "#b45309" }]}>{theory! + practical!} · {grade}</Text>
                </View>
              )}
            </View>

            <View style={styles.inputs}>
              {row.status === "PRESENT" ? (
                <>
                  <MarkInput
                    ref={(el) => {
                      inputs.current[theoryIndex] = el;
                    }}
                    label={t("theory")}
                    full={subject.theoryFullMarks}
                    value={row.theory}
                    editable={editable}
                    invalid={Boolean(parseMark(row.theory, subject.theoryFullMarks).error)}
                    onChange={(text) => update(student.studentId, { theory: text })}
                    onNext={() => focusNext(theoryIndex)}
                  />
                  {hasPractical && (
                    <MarkInput
                      ref={(el) => {
                        inputs.current[practicalIndex] = el;
                      }}
                      label={t("practical")}
                      full={subject.practicalFullMarks}
                      value={row.practical}
                      editable={editable}
                      invalid={Boolean(parseMark(row.practical, subject.practicalFullMarks).error)}
                      onChange={(text) => update(student.studentId, { practical: text })}
                      onNext={() => focusNext(practicalIndex)}
                    />
                  )}
                </>
              ) : (
                <View style={styles.away}>
                  <Text style={styles.awayText}>{t(row.status === "ABSENT" ? "absent" : "medical")}</Text>
                </View>
              )}
              {editable && (
                <>
                  <Toggle label="A" active={row.status === "ABSENT"} color={colors.danger} accessibilityLabel={`${student.name}: ${t("absent")}`} onPress={() => update(student.studentId, { status: row.status === "ABSENT" ? "PRESENT" : "ABSENT" })} />
                  <Toggle label="M" active={row.status === "MEDICAL"} color="#7c3aed" accessibilityLabel={`${student.name}: ${t("medical")}`} onPress={() => update(student.studentId, { status: row.status === "MEDICAL" ? "PRESENT" : "MEDICAL" })} />
                </>
              )}
            </View>
            {problem ? <Text style={styles.error}>{t(problem)}</Text> : below ? <Text style={styles.warn}>{t("belowPass")}</Text> : null}
          </Card>
        );
      })}
    </Screen>
  );
}

/** Same rule as the report card: failing either part means the lowest grade. */
function gradeOf(percentage: number, bands: GradeBand[], failed: boolean): string | null {
  if (!bands.length) return null;
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  if (failed) return sorted[sorted.length - 1].grade;
  return (sorted.find((b) => percentage >= b.min) ?? sorted[sorted.length - 1]).grade;
}

function MarkInput({ ref, label, full, value, editable, invalid, onChange, onNext }: {
  ref: (el: TextInput | null) => void;
  label: string;
  full: number;
  value: string;
  editable: boolean;
  invalid: boolean;
  onChange: (text: string) => void;
  onNext: () => void;
}) {
  return (
    <View style={[styles.field, invalid && { borderColor: colors.danger }, !editable && { backgroundColor: colors.background }]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldRow}>
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChange}
          editable={editable}
          keyboardType="decimal-pad"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={onNext}
          placeholder="–"
          placeholderTextColor="#94a3b8"
          maxLength={6}
          selectTextOnFocus
          style={[styles.fieldInput, invalid && { color: colors.danger }]}
          accessibilityLabel={`${label} out of ${full}`}
        />
        <Text style={styles.outOf}>/ {full}</Text>
      </View>
    </View>
  );
}

function Toggle({ label, active, color, onPress, accessibilityLabel }: { label: string; active: boolean; color: string; onPress: () => void; accessibilityLabel: string }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.toggle, active && { backgroundColor: color, borderColor: color }, pressed && { opacity: 0.7 }]}
      accessibilityRole="switch"
      accessibilityState={{ checked: active }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
    >
      <Text style={[styles.toggleText, { color: active ? colors.white : color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  muted: { color: colors.muted, fontSize: 15 },
  bold: { fontWeight: "700", color: colors.text },
  message: { fontSize: 14, textAlign: "center", color: "#15803d" },
  banner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12 },
  info: { gap: 4, paddingVertical: 12 },
  infoText: { color: colors.text, fontSize: 14 },
  footerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  progress: { fontWeight: "700", color: colors.text },
  row: { gap: 10, padding: 12 },
  person: { flexDirection: "row", alignItems: "center", gap: 10 },
  roll: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center" },
  rollText: { color: colors.brand, fontWeight: "700", fontSize: 13 },
  name: { flex: 1, fontSize: 16, fontWeight: "600", color: colors.text },
  grade: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: "#dcfce7" },
  gradeText: { fontWeight: "700", color: "#15803d", fontSize: 14 },
  inputs: { flexDirection: "row", gap: 8, alignItems: "stretch" },
  field: { flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.white },
  fieldLabel: { fontSize: 13, color: colors.muted },
  fieldRow: { flexDirection: "row", alignItems: "center" },
  fieldInput: { flex: 1, fontSize: 20, fontWeight: "700", color: colors.text, paddingVertical: 2, minWidth: 40 },
  outOf: { color: colors.muted, fontSize: 14 },
  away: { flex: 1, borderRadius: 12, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", minHeight: 52 },
  awayText: { color: colors.muted, fontWeight: "600" },
  toggle: { width: 48, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.white },
  toggleText: { fontSize: 16, fontWeight: "800" },
  error: { color: colors.danger, fontSize: 15 },
  warn: { color: "#b45309", fontSize: 15 },
});
