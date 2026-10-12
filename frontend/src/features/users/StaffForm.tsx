import { Controller, useForm } from "react-hook-form";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { DateInput } from "@/components/ui/DateInput";
import { Checkbox, Field, FormError, Input, Select } from "@/components/ui/form";
import { applyApiErrors } from "@/lib/forms";
import { useRoles } from "../roles/roles.api";
import type { UserDetail } from "./users.api";

export interface StaffFormValues {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  roleIds: string[];
  staffProfile: {
    employeeId: string;
    designation: string;
    gender: "" | "MALE" | "FEMALE" | "OTHER";
    dateOfBirth: string;
    joinDate: string;
    qualification: string;
    address: string;
  };
}

interface StaffFormProps {
  user?: UserDetail;
  onSubmit: (values: StaffFormValues) => Promise<void>;
  onCancel?: () => void;
  submitLabel: string;
}

/** Add/edit a staff member. Roles and password are only shown when creating. */
export function StaffForm({ user, onSubmit, onCancel, submitLabel }: StaffFormProps) {
  const creating = !user;
  const { data: roles = [] } = useRoles();
  const [formError, setFormError] = useState<string | null>(null);
  const p = user?.staffProfile;

  const { register, handleSubmit, control, setError, formState } = useForm<StaffFormValues>({
    defaultValues: {
      fullName: user?.fullName ?? "",
      email: user?.email ?? "",
      phone: user?.phone ?? "",
      password: "",
      roleIds: [],
      staffProfile: {
        employeeId: p?.employeeId ?? "",
        designation: p?.designation ?? "",
        gender: p?.gender ?? "",
        dateOfBirth: p?.dateOfBirth ?? "",
        joinDate: p?.joinDate ?? "",
        qualification: p?.qualification ?? "",
        address: p?.address ?? "",
      },
    },
  });
  const errors = formState.errors;

  const submit = handleSubmit(async (values) => {
    try {
      setFormError(null);
      await onSubmit(values);
    } catch (e) {
      setFormError(applyApiErrors(e, setError));
    }
  });

  const staffRoles = roles.filter((r) => r.key !== "parent" && r.key !== "student");

  return (
    <form onSubmit={submit} className="space-y-6">
      <FormError message={formError} />

      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required error={errors.fullName?.message} className="sm:col-span-2">
          <Input {...register("fullName", { required: "Required" })} />
        </Field>
        <Field label="Email" error={errors.email?.message}>
          <Input type="email" {...register("email")} />
        </Field>
        <Field label="Mobile" error={errors.phone?.message} hint="Used for OTP login and notifications">
          <Input {...register("phone")} placeholder="98XXXXXXXX" />
        </Field>
        <Field label="Designation" error={errors.staffProfile?.designation?.message}>
          <Input {...register("staffProfile.designation")} placeholder="e.g. Science Teacher" />
        </Field>
        <Field label="Employee ID" error={errors.staffProfile?.employeeId?.message}>
          <Input {...register("staffProfile.employeeId")} />
        </Field>
        <Field label="Gender">
          <Select {...register("staffProfile.gender")}>
            <option value="">—</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </Select>
        </Field>
        <Field label="Qualification">
          <Input {...register("staffProfile.qualification")} placeholder="e.g. M.Ed." />
        </Field>
        <Field label="Date of birth">
          <Controller control={control} name="staffProfile.dateOfBirth" render={({ field }) => <DateInput value={field.value} onChange={field.onChange} />} />
        </Field>
        <Field label="Joined on">
          <Controller control={control} name="staffProfile.joinDate" render={({ field }) => <DateInput value={field.value} onChange={field.onChange} />} />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <Input {...register("staffProfile.address")} />
        </Field>
      </section>

      {creating && (
        <>
          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Roles</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {staffRoles.map((role) => (
                <Checkbox key={role.id} value={role.id} {...register("roleIds")} label={role.name} />
              ))}
            </div>
          </section>
          <Field label="Password" error={errors.password?.message} hint="Optional — without one, they sign in with their mobile number + OTP">
            <Input type="text" {...register("password", { minLength: { value: 8, message: "At least 8 characters" } })} autoComplete="new-password" />
          </Field>
        </>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={formState.isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
