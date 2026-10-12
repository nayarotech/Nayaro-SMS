import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useI18n } from "@/lib/i18n";
import { colors } from "./ui";

/** Standard inner screen: back button, title, pull-to-refresh, offline note, and an optional fixed footer (e.g. a Save button). */
export function Screen({
  title,
  subtitle,
  children,
  onRefresh,
  offline,
  loading,
  footer,
  tab,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onRefresh?: () => Promise<void>;
  offline?: boolean;
  loading?: boolean;
  footer?: ReactNode;
  /** A bottom-tab screen: no back button */
  tab?: boolean;
}) {
  const { t } = useI18n();
  const [refreshing, setRefreshing] = useState(false);
  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        {tab ? null : (
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/home"))} style={styles.back} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={24} color={colors.brand} />
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await onRefresh();
                setRefreshing(false);
              }}
            />
          ) : undefined
        }
      >
        {offline ? <Text style={styles.offline}>{t("offline")}</Text> : null}
        {loading ? <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} /> : children}
      </ScrollView>
      {footer && !loading ? (
        <SafeAreaView edges={["bottom"]} style={styles.footer}>
          <View style={styles.footerInner}>{footer}</View>
        </SafeAreaView>
      ) : null}
    </SafeAreaView>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10, minHeight: 60, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 44, height: 44, borderRadius: 22, marginLeft: -8, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "700", color: colors.text },
  subtitle: { fontSize: 14, color: colors.muted },
  content: { padding: 16, gap: 14, maxWidth: 560, width: "100%", alignSelf: "center" },
  offline: { backgroundColor: "#fffbeb", color: "#92400e", padding: 10, borderRadius: 10, fontSize: 15 },
  footer: { backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border },
  footerInner: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, maxWidth: 560, width: "100%", alignSelf: "center" },
});
