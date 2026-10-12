import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { useUnread } from "@/lib/unread";
import { colors } from "@/components/ui";

type IconName = keyof typeof Ionicons.glyphMap;
/** Our own label so long words like "Attendance" aren't cut off by the default label's width limit. */
function TabLabel({ focused, color, children }: { focused: boolean; color: ColorValue; children: string }) {
  return (
    <Text numberOfLines={1} style={{ color, fontSize: 12, letterSpacing: -0.2, fontWeight: focused ? "700" : "600", textAlign: "center" }}>
      {children}
    </Text>
  );
}

function icon(name: IconName, active: IconName) {
  return function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Ionicons name={focused ? active : name} size={26} color={color} />;
  };
}

/**
 * Bottom tabs, always with text labels (easier for parents than icons alone):
 * - Parent:            Home · Attendance · Results · Inbox · Me
 * - Teacher:           Today · Marks · Inbox · Me
 * - Teacher + parent:  Today · Marks · Children · Inbox · Me
 */
export default function TabsLayout() {
  const { t } = useI18n();
  const { status, me, children } = useSession();
  const unread = useUnread();
  if (status === "signedOut") return <Redirect href="/login" />;

  const can = (permission: string) => Boolean(me?.permissions?.includes(permission));
  const isTeacher = can("attendance.mark") || can("attendance.proxy.assign") || can("marks.enter");
  const isParent = children.length > 0;
  const show = (visible: boolean) => (visible ? {} : { href: null });

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: "#64748b",
        tabBarLabel: ({ focused, color, children }) => <TabLabel focused={focused} color={color}>{children}</TabLabel>,
        tabBarStyle: { height: 68, paddingTop: 6, borderTopColor: colors.border },
        tabBarItemStyle: { paddingBottom: 6, paddingHorizontal: 0 },
      }}
    >
      <Tabs.Screen name="home" options={{ title: isTeacher ? t("tabToday") : t("tabHome"), tabBarIcon: icon(isTeacher ? "today-outline" : "home-outline", isTeacher ? "today" : "home") }} />
      <Tabs.Screen name="marks" options={{ title: t("tabMarks"), tabBarIcon: icon("create-outline", "create"), ...show(can("marks.enter")) }} />
      <Tabs.Screen name="children" options={{ title: t("tabChildren"), tabBarIcon: icon("people-outline", "people"), ...show(isTeacher && isParent) }} />
      <Tabs.Screen name="attendance" options={{ title: t("attendance"), tabBarIcon: icon("calendar-outline", "calendar"), ...show(!isTeacher) }} />
      <Tabs.Screen name="results" options={{ title: t("results"), tabBarIcon: icon("trophy-outline", "trophy"), ...show(!isTeacher) }} />
      <Tabs.Screen name="inbox" options={{ title: t("tabInbox"), tabBarIcon: icon("notifications-outline", "notifications"), tabBarBadge: unread > 0 ? (unread > 9 ? "9+" : unread) : undefined }} />
      <Tabs.Screen name="me" options={{ title: t("tabMe"), tabBarIcon: icon("person-circle-outline", "person-circle") }} />
    </Tabs>
  );
}
