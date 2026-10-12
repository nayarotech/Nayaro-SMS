import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { TeacherMarks } from "@/components/MarkSheets";
import { ParentHome } from "@/components/ParentHome";
import { TeacherClasses } from "@/components/TeacherClasses";
import { colors } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

/** First tab: "Today" for teachers (attendance to take, marks to enter), "Home" for parents. */
export default function HomeScreen() {
  const { t } = useI18n();
  const { me, refresh } = useSession();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const can = (permission: string) => Boolean(me?.permissions?.includes(permission));
  const takesAttendance = can("attendance.mark") || can("attendance.proxy.assign");
  const entersMarks = can("marks.enter");

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh().catch(() => undefined);
    setRefreshKey((k) => k + 1);
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.school} numberOfLines={1}>{me?.school?.name ?? t("appName")}</Text>
        <Text style={styles.greeting} numberOfLines={1}>Namaste, {me?.fullName.split(" ")[0]}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}>
        <View key={refreshKey} style={{ gap: 16 }}>
          {takesAttendance || entersMarks ? (
            <View style={{ gap: 24 }}>
              {takesAttendance && <TeacherClasses canSeeAll={can("attendance.proxy.assign")} />}
              {entersMarks && <TeacherMarks />}
            </View>
          ) : (
            <ParentHome />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  school: { fontSize: 14, color: colors.muted },
  greeting: { fontSize: 24, fontWeight: "700", color: colors.text },
  content: { padding: 16, gap: 16, maxWidth: 560, width: "100%", alignSelf: "center" },
});
