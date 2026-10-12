import clsx from "clsx";
import { Building2, GraduationCap } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router";
import { Button } from "@/components/ui/Button";
import { Field, FormError, Input } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { LoginResult } from "@/lib/types";

type Mode = "password" | "otp";
type SchoolChoice = Extract<LoginResult, { status: "select_school" }>;

export function LoginPage() {
  const { t } = useTranslation();
  const { user, completeLogin } = useAuth();
  const [mode, setMode] = useState<Mode>("password");
  const [choice, setChoice] = useState<SchoolChoice | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to="/" replace />;

  const handleResult = async (result: LoginResult) => {
    if (result.status === "ok") await completeLogin(result.accessToken);
    else setChoice(result);
  };

  const chooseSchool = async (userId: string) => {
    if (!choice) return;
    try {
      const result = await api.post<{ accessToken: string }>("/auth/select-school", { selectionToken: choice.selectionToken, userId });
      await completeLogin(result.accessToken);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong");
      setChoice(null);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-brand-soft px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-brand text-white">
            <GraduationCap className="size-7" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">{t("auth.title")}</h1>
          <p className="text-sm text-slate-500">{t("auth.subtitle")}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {choice ? (
            <div>
              <h2 className="font-medium text-slate-900">{t("auth.chooseSchool")}</h2>
              <p className="mb-4 text-sm text-slate-500">{t("auth.chooseSchoolHint")}</p>
              <div className="space-y-2">
                {choice.accounts.map((account) => (
                  <button
                    key={account.userId}
                    onClick={() => void chooseSchool(account.userId)}
                    className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-left hover:border-brand hover:bg-brand-soft"
                  >
                    <Building2 className="size-5 text-slate-400" />
                    <span>
                      <span className="block text-sm font-medium text-slate-900">{account.schoolName}</span>
                      <span className="block text-xs text-slate-500">{account.schoolCode}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="mb-5 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm">
                {(["password", "otp"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      setMode(m);
                      setError(null);
                    }}
                    className={clsx("rounded-md py-1.5 font-medium", mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
                  >
                    {t(m === "password" ? "auth.password" : "auth.otp")}
                  </button>
                ))}
              </div>
              <FormError message={error} />
              <div className={error ? "mt-4" : ""}>
                {mode === "password" ? (
                  <PasswordForm onResult={handleResult} onError={setError} />
                ) : (
                  <OtpForm onResult={handleResult} onError={setError} />
                )}
              </div>
            </>
          )}
        </div>

        {import.meta.env.DEV && (
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white/60 p-3 text-xs text-slate-600">
            <p className="font-medium text-slate-700">Demo logins</p>
            <p>School code: DEMO</p>
            <p>School admin: admin@demo.school / Password@123</p>
            <p>Super admin: superadmin@sms.local / SuperAdmin@123</p>
          </div>
        )}
      </div>
    </div>
  );
}

interface FormProps {
  onResult: (result: LoginResult) => Promise<void>;
  onError: (message: string | null) => void;
}

/** The school code is remembered on this device so staff don't retype it. */
function useSchoolCode() {
  const [code, setCode] = useState(() => {
    try {
      return localStorage.getItem("schoolCode") ?? "";
    } catch {
      return "";
    }
  });
  const save = (value: string) => {
    const upper = value.toUpperCase();
    setCode(upper);
    try {
      localStorage.setItem("schoolCode", upper);
    } catch {
      // storage unavailable — not remembered
    }
  };
  return [code, save] as const;
}

function SchoolCodeField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Field label="School code" hint="Leave empty if you're the platform administrator">
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="e.g. DEMO" className="font-mono uppercase" maxLength={12} />
    </Field>
  );
}

function PasswordForm({ onResult, onError }: FormProps) {
  const { t } = useTranslation();
  const [schoolCode, setSchoolCode] = useSchoolCode();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    onError(null);
    try {
      await onResult(await api.post<LoginResult>("/auth/login", { identifier, password, schoolCode: schoolCode.trim() || undefined }, { noRetry: true }));
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "Could not reach the server");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <SchoolCodeField value={schoolCode} onChange={setSchoolCode} />
      <Field label={t("auth.identifier")}>
        <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required autoFocus={Boolean(schoolCode)} />
      </Field>
      <Field label={t("auth.passwordLabel")}>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
      </Field>
      <Button type="submit" className="w-full" loading={busy}>
        {t("auth.signIn")}
      </Button>
    </form>
  );
}

function OtpForm({ onResult, onError }: FormProps) {
  const { t } = useTranslation();
  const [schoolCode, setSchoolCode] = useSchoolCode();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    onError(null);
    try {
      await action();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "Could not reach the server");
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      const result = await api.post<{ sent: boolean; devCode?: string }>("/auth/otp/request", { phone, schoolCode: schoolCode.trim() || undefined }, { noRetry: true });
      setSent(true);
      setDevCode(result.devCode ?? null);
    });

  const verify = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => onResult(await api.post<LoginResult>("/auth/otp/verify", { phone, code, schoolCode: schoolCode.trim() || undefined }, { noRetry: true })));
  };

  if (!sent) {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void sendCode();
        }}
        className="space-y-4"
      >
        <SchoolCodeField value={schoolCode} onChange={setSchoolCode} />
        <Field label={t("auth.phone")}>
          <Input type="tel" inputMode="numeric" placeholder="98XXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} required autoFocus />
        </Field>
        <Button type="submit" className="w-full" loading={busy}>
          {t("auth.sendCode")}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="space-y-4">
      <p className="text-sm text-slate-600">
        Code sent to <span className="font-medium">{phone}</span>.
      </p>
      {devCode && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Development mode — your code is <span className="font-mono font-semibold">{devCode}</span>
        </p>
      )}
      <Field label={t("auth.code")}>
        <Input
          inputMode="numeric"
          maxLength={6}
          className="text-center font-mono text-lg tracking-[0.5em]"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          required
          autoFocus
        />
      </Field>
      <Button type="submit" className="w-full" loading={busy} disabled={code.length !== 6}>
        {t("auth.verify")}
      </Button>
      <button type="button" className="w-full text-center text-sm text-brand hover:underline" onClick={() => void sendCode()}>
        {t("auth.resend")}
      </button>
    </form>
  );
}
