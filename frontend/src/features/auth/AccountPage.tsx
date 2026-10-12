import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Badge, Card, PageHeader } from "@/components/ui/display";
import { Field, FormError, Input, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/forms";

export function AccountPage() {
  const { user, reload } = useAuth();
  const { i18n } = useTranslation();
  const toast = useToast();
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [language, setLanguage] = useState(user?.preferredLanguage ?? "en");
  const [profileError, setProfileError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"profile" | "password" | null>(null);

  if (!user) return null;

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("profile");
    try {
      await api.patch("/auth/me", { fullName, preferredLanguage: language });
      await i18n.changeLanguage(language);
      await reload();
      setProfileError(null);
      toast.success("Profile saved");
    } catch (e) {
      setProfileError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("password");
    try {
      await api.post("/auth/change-password", { currentPassword: currentPassword || undefined, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setPasswordError(null);
      await reload();
      toast.success("Password changed");
    } catch (e) {
      setPasswordError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="My account" />

      <Card title="Profile">
        <form onSubmit={saveProfile} className="space-y-4">
          <FormError message={profileError} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name">
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </Field>
            <Field label="Language">
              <Select value={language} onChange={(e) => setLanguage(e.target.value as "en" | "ne")}>
                <option value="en">English</option>
                <option value="ne">नेपाली</option>
              </Select>
            </Field>
            <Field label="Email">
              <Input value={user.email ?? "—"} disabled />
            </Field>
            <Field label="Mobile">
              <Input value={user.phone ?? "—"} disabled />
            </Field>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {user.isSuperAdmin && <Badge tone="amber">Super Admin</Badge>}
              {user.roles.map((role) => (
                <Badge key={role.key} tone="brand">
                  {role.name}
                </Badge>
              ))}
            </div>
            <Button type="submit" loading={busy === "profile"}>
              Save
            </Button>
          </div>
        </form>
      </Card>

      <Card title={user.hasPassword ? "Change password" : "Set a password"}>
        <form onSubmit={changePassword} className="space-y-4">
          <FormError message={passwordError} />
          {!user.hasPassword && <p className="text-sm text-slate-500">You currently sign in with phone + OTP. Setting a password lets you sign in with it too.</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            {user.hasPassword && (
              <Field label="Current password">
                <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" required />
              </Field>
            )}
            <Field label="New password" hint="At least 8 characters">
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" loading={busy === "password"}>
              {user.hasPassword ? "Change password" : "Set password"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
