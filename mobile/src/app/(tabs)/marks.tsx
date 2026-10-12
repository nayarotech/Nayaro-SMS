import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SheetCard } from "@/components/MarkSheets";
import { Screen } from "@/components/Screen";
import { Card, colors } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import type { MySheets } from "@/lib/types";
import { useCachedFetch } from "@/lib/use-cached";

/** Every mark sheet the teacher is responsible for this year, grouped by exam (newest first). */
export default function MarkSheetsScreen() {
  const { t } = useI18n();
  const { data, offline, loading, reload } = useCachedFetch<MySheets>("/exams/my-sheets");
  // Come back from a sheet → show its new progress
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return (
    <Screen title={t("marksEntry")} tab onRefresh={reload} offline={offline} loading={loading && !data}>
      {!data?.exams.length ? (
        <Card><Text style={styles.muted}>{t("noMarkSheets")}</Text></Card>
      ) : (
        data.exams.map((exam) => (
          <View key={exam.id} style={{ gap: 10 }}>
            <Text style={styles.exam}>{exam.name}</Text>
            {exam.sheets.map((sheet) => (
              <SheetCard key={`${sheet.sectionId}:${sheet.subjectId}`} examId={exam.id} sheet={sheet} />
            ))}
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  muted: { color: colors.muted, fontSize: 14 },
  exam: { fontSize: 16, fontWeight: "700", color: colors.text, marginTop: 4 },
});
