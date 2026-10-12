import { ParentHome } from "@/components/ParentHome";
import { Screen } from "@/components/Screen";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

/** For teachers who are also parents: their own children, same as a parent's Home. */
export default function ChildrenScreen() {
  const { t } = useI18n();
  const { refresh } = useSession();
  return (
    <Screen title={t("myChildren")} tab onRefresh={refresh}>
      <ParentHome />
    </Screen>
  );
}
