import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { colors } from "@/components/ui";
import { useSession } from "@/lib/session";

/** Sends the user to login or home depending on whether they're signed in. */
export default function Index() {
  const { status } = useSession();
  if (status === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }
  return <Redirect href={status === "signedIn" ? "/home" : "/login"} />;
}
