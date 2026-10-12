import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Card, PageHeader, Spinner } from "@/components/ui/display";
import { Field, FormError, Input } from "@/components/ui/form";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { applyApiErrors, emptyToNull } from "@/lib/forms";

interface SchoolProfile {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
}

type FormValues = { name: string; address: string; phone: string; email: string };

export function SchoolProfilePage() {
  const { can, reload } = useAuth();
  const toast = useToast();
  const editable = can("school.settings.edit");
  const { data, refetch } = useQuery({ queryKey: ["school-profile"], queryFn: () => api.get<SchoolProfile>("/school") });
  // `values` keeps the form in step with the loaded profile
  const { register, handleSubmit, setError, formState } = useForm<FormValues>({
    values: data && { name: data.name, address: data.address ?? "", phone: data.phone ?? "", email: data.email ?? "" },
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [newLogo, setNewLogo] = useState<{ key: string; url: string } | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await api.patch("/school", { ...emptyToNull(values), ...(newLogo && { logoKey: newLogo.key }) });
      await Promise.all([refetch(), reload()]);
      setFormError(null);
      toast.success("School profile saved");
    } catch (e) {
      setFormError(applyApiErrors(e, setError));
    }
  });

  if (!data) return <Spinner />;

  return (
    <div className="max-w-3xl">
      <PageHeader title="School profile" description="Shown on report cards, receipts, the app and messages to parents." />
      <form onSubmit={onSubmit}>
        <Card>
          <div className="space-y-5">
            <FormError message={formError} />
            <Field label="Logo">
              <ImageUpload purpose="school-logo" url={newLogo?.url ?? data.logoUrl} onUploaded={setNewLogo} disabled={!editable} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="School name" required error={formState.errors.name?.message} className="sm:col-span-2">
                <Input {...register("name", { required: "Required" })} disabled={!editable} />
              </Field>
              <Field label="School code" hint="Set by the platform administrator">
                <Input value={data.code} disabled />
              </Field>
              <Field label="Phone" error={formState.errors.phone?.message}>
                <Input {...register("phone")} disabled={!editable} />
              </Field>
              <Field label="Email" error={formState.errors.email?.message}>
                <Input type="email" {...register("email")} disabled={!editable} />
              </Field>
              <Field label="Address" error={formState.errors.address?.message}>
                <Input {...register("address")} disabled={!editable} />
              </Field>
            </div>
            {editable && (
              <div className="flex justify-end">
                <Button type="submit" loading={formState.isSubmitting}>
                  Save
                </Button>
              </div>
            )}
          </div>
        </Card>
      </form>
    </div>
  );
}
