import { FileText, Link2, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Controller, useFieldArray, useForm, useWatch, type Control, type UseFormRegister, type UseFormSetValue } from "react-hook-form";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { DateInput } from "@/components/ui/DateInput";
import { Card, PageHeader } from "@/components/ui/display";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { useToast } from "@/components/ui/toast";
import { api, uploadFile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { todayAd } from "@/lib/dates";
import { generatePassword } from "@/lib/password";
import { applyApiErrors } from "@/lib/forms";
import { useClasses } from "../academic/academic.api";
import { GuardianPicker } from "./GuardianPicker";
import { RELATIONS, type Gender, type Relation, type StudentDetail } from "./students.api";

interface GuardianEntry {
  /** Set when linking an existing parent (e.g. a sibling's) */
  existing: { id: string; fullName: string; phone: string | null } | null;
  fullName: string;
  phone: string;
  email: string;
  occupation: string;
  whatsappOptIn: boolean;
  password: string;
  relation: Relation;
}

export interface AdmissionForm {
  firstName: string;
  middleName: string;
  lastName: string;
  gender: Gender | "";
  dateOfBirth: string;
  bloodGroup: string;
  religion: string;
  nationality: string;
  address: string;
  temporaryAddress: string;
  phone: string;
  email: string;
  admissionDate: string;
  admissionNo: string;
  previousSchool: string;
  medicalNotes: string;
  classId: string;
  sectionId: string;
  rollNo: string;
  primaryGuardian: number;
  guardians: GuardianEntry[];
}

const emptyGuardian = (relation: Relation): GuardianEntry => ({
  existing: null,
  fullName: "",
  phone: "",
  email: "",
  occupation: "",
  whatsappOptIn: false,
  password: "",
  relation,
});

export function AdmissionPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: classes = [] } = useClasses();
  const autoAdmissionNo = user?.settings?.["students.autoAdmissionNo"] !== false;

  const [photo, setPhoto] = useState<{ key: string; url: string } | null>(null);
  const [documents, setDocuments] = useState<{ title: string; file: File }[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const { register, control, handleSubmit, setValue, setError, formState } = useForm<AdmissionForm>({
    defaultValues: {
      nationality: "Nepali",
      admissionDate: todayAd(),
      gender: "",
      primaryGuardian: 0,
      guardians: [emptyGuardian("FATHER"), emptyGuardian("MOTHER")],
    },
  });
  const guardians = useFieldArray({ control, name: "guardians" });
  const errors = formState.errors;
  const classId = useWatch({ control, name: "classId" });
  const sections = classes.find((c) => c.id === classId)?.sections ?? [];

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    // Skip guardian rows left completely empty
    const filled = values.guardians
      .map((g, index) => ({ g, index }))
      .filter(({ g }) => g.existing || g.fullName.trim());
    if (filled.length === 0) {
      setFormError("Add at least one parent or guardian");
      return;
    }

    try {
      // Upload documents first; each returns a key we attach to the admission
      const uploaded = [];
      for (const doc of documents) {
        const file = await uploadFile(doc.file, "student-document");
        uploaded.push({ title: doc.title || doc.file.name, fileKey: file.key });
      }

      const nullable = (v: string) => (v.trim() ? v.trim() : null);
      const student = await api.post<StudentDetail>("/students", {
        firstName: values.firstName,
        middleName: nullable(values.middleName ?? ""),
        lastName: values.lastName,
        gender: values.gender,
        dateOfBirth: values.dateOfBirth,
        bloodGroup: nullable(values.bloodGroup ?? ""),
        religion: nullable(values.religion ?? ""),
        nationality: nullable(values.nationality ?? ""),
        address: nullable(values.address ?? ""),
        temporaryAddress: nullable(values.temporaryAddress ?? ""),
        phone: nullable(values.phone ?? ""),
        email: nullable(values.email ?? ""),
        admissionDate: values.admissionDate,
        admissionNo: autoAdmissionNo ? null : values.admissionNo,
        previousSchool: nullable(values.previousSchool ?? ""),
        medicalNotes: nullable(values.medicalNotes ?? ""),
        photoKey: photo?.key ?? null,
        enrollment: { sectionId: values.sectionId, rollNo: values.rollNo ? Number(values.rollNo) : null },
        guardians: filled.map(({ g, index }) => ({
          relation: g.relation,
          isPrimary: index === Number(values.primaryGuardian),
          ...(g.existing
            ? { guardianId: g.existing.id }
            : {
                guardian: {
                  fullName: g.fullName,
                  phone: nullable(g.phone),
                  email: nullable(g.email),
                  occupation: nullable(g.occupation),
                  whatsappOptIn: g.whatsappOptIn,
                  password: nullable(g.password),
                },
              }),
        })),
        documents: uploaded,
      });

      await Promise.all(["students", "dashboard", "guardians", "classes"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
      toast.success(`${student.fullName} admitted · ${student.admissionNo}`);
      navigate(`/students/${student.id}`);
    } catch (e) {
      setFormError(applyApiErrors(e, setError) ?? "Please check the highlighted fields");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="New admission" description="Student details, class, parents and documents — saved together." />
      <FormError message={formError} />

      <Card title="Student">
        <div className="space-y-5">
          <ImageUpload purpose="student-photo" url={photo?.url ?? null} onUploaded={setPhoto} label="Add photo" />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="First name" required error={errors.firstName?.message}>
              <Input {...register("firstName", { required: "Required" })} />
            </Field>
            <Field label="Middle name">
              <Input {...register("middleName")} />
            </Field>
            <Field label="Last name" required error={errors.lastName?.message}>
              <Input {...register("lastName", { required: "Required" })} />
            </Field>
            <Field label="Gender" required error={errors.gender?.message}>
              <Select {...register("gender", { required: "Required" })}>
                <option value="">Select…</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </Select>
            </Field>
            <Field label="Date of birth" required error={errors.dateOfBirth?.message}>
              <Controller control={control} name="dateOfBirth" rules={{ required: "Required" }} render={({ field }) => <DateInput value={field.value ?? ""} onChange={field.onChange} />} />
            </Field>
            <Field label="Blood group">
              <Select {...register("bloodGroup")}>
                <option value="">—</option>
                {["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"].map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </Select>
            </Field>
            <Field label="Religion">
              <Input {...register("religion")} />
            </Field>
            <Field label="Nationality">
              <Input {...register("nationality")} />
            </Field>
            <Field label="Student's phone">
              <Input {...register("phone")} />
            </Field>
            <Field label="Permanent address" className="sm:col-span-2">
              <Input {...register("address")} />
            </Field>
            <Field label="Email">
              <Input type="email" {...register("email")} />
            </Field>
            <Field label="Temporary address" className="sm:col-span-2">
              <Input {...register("temporaryAddress")} />
            </Field>
            <Field label="Previous school">
              <Input {...register("previousSchool")} />
            </Field>
            <Field label="Medical notes / allergies" className="sm:col-span-3" hint="Only what staff need to know to keep the child safe">
              <Textarea {...register("medicalNotes")} rows={2} />
            </Field>
          </div>
        </div>
      </Card>

      <Card title="Admission & class">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Admission date" required error={errors.admissionDate?.message} className="sm:col-span-2">
            <Controller control={control} name="admissionDate" rules={{ required: "Required" }} render={({ field }) => <DateInput value={field.value} onChange={field.onChange} />} />
          </Field>
          <Field label="Admission no." required={!autoAdmissionNo} error={errors.admissionNo?.message} className="sm:col-span-2" hint={autoAdmissionNo ? "Generated automatically (change in Settings → Students)" : undefined}>
            <Input {...register("admissionNo", { required: !autoAdmissionNo && "Required" })} disabled={autoAdmissionNo} placeholder={autoAdmissionNo ? "Automatic" : ""} />
          </Field>
          <Field label="Class" required error={errors.classId?.message}>
            <Select {...register("classId", { required: "Required", onChange: () => setValue("sectionId", "") })}>
              <option value="">Select…</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Section" required error={errors.sectionId?.message}>
            <Select {...register("sectionId", { required: "Required" })} disabled={!classId}>
              <option value="">Select…</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.studentCount}
                  {s.capacity ? `/${s.capacity}` : ""} students)
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Roll no." hint="Leave empty for the next number">
            <Input type="number" min={1} {...register("rollNo")} />
          </Field>
        </div>
      </Card>

      <Card
        title="Parents & guardians"
        actions={
          guardians.fields.length < 4 && (
            <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => guardians.append(emptyGuardian("GUARDIAN"))}>
              Add guardian
            </Button>
          )
        }
      >
        <p className="-mt-1 mb-4 text-sm text-slate-500">
          Parents sign in to the app with their mobile number. If a brother or sister already studies here, link their existing parent instead of typing them again.
        </p>
        <div className="space-y-4">
          {guardians.fields.map((field, index) => (
            <GuardianCard
              key={field.id}
              index={index}
              control={control}
              register={register}
              setValue={setValue}
              onLink={(g) => setValue(`guardians.${index}.existing`, g ? { id: g.id, fullName: g.fullName, phone: g.phone } : null)}
              onRemove={guardians.fields.length > 1 ? () => guardians.remove(index) : undefined}
            />
          ))}
        </div>
      </Card>

      <Card title="Documents">
        <p className="-mt-1 mb-3 text-sm text-slate-500">Birth certificate, previous school's transfer certificate, etc. PDF or images.</p>
        <ul className="space-y-2">
          {documents.map((doc, index) => (
            <li key={index} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
              <FileText className="size-4 shrink-0 text-slate-400" />
              <Input
                value={doc.title}
                onChange={(e) => setDocuments((d) => d.map((x, i) => (i === index ? { ...x, title: e.target.value } : x)))}
                className="h-8"
                placeholder="Document title"
              />
              <span className="hidden max-w-40 truncate text-xs text-slate-500 sm:block">{doc.file.name}</span>
              <button type="button" onClick={() => setDocuments((d) => d.filter((_, i) => i !== index))} aria-label="Remove">
                <X className="size-4 text-slate-400" />
              </button>
            </li>
          ))}
        </ul>
        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-brand hover:underline">
          <Plus className="size-4" /> Add document
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setDocuments((d) => [...d, { title: file.name.replace(/\.[^.]+$/, ""), file }]);
              e.target.value = "";
            }}
          />
        </label>
      </Card>

      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <Button variant="secondary" onClick={() => navigate(-1)}>
          Cancel
        </Button>
        <Button type="submit" loading={formState.isSubmitting}>
          Admit student
        </Button>
      </div>
    </form>
  );
}

function GuardianCard({
  index,
  control,
  register,
  setValue,
  onLink,
  onRemove,
}: {
  index: number;
  control: Control<AdmissionForm>;
  register: UseFormRegister<AdmissionForm>;
  setValue: UseFormSetValue<AdmissionForm>;
  onLink: (guardian: { id: string; fullName: string; phone: string | null } | null) => void;
  onRemove?: () => void;
}) {
  const [linking, setLinking] = useState(false);
  const toast = useToast();
  const schoolCode = useAuth().user?.school?.code ?? "";
  const existing = useWatch({ control, name: `guardians.${index}.existing` });

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Select {...register(`guardians.${index}.relation`)} className="h-8 w-36">
            {RELATIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </Select>
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            <Controller
              control={control}
              name="primaryGuardian"
              render={({ field }) => <input type="radio" className="accent-brand" checked={Number(field.value) === index} onChange={() => field.onChange(index)} />}
            />
            Primary contact
          </label>
        </div>
        <div className="flex gap-1">
          {!existing && (
            <Button size="sm" variant="ghost" icon={<Link2 className="size-3.5" />} onClick={() => setLinking(!linking)}>
              {linking ? "Enter new instead" : "Link existing parent"}
            </Button>
          )}
          {onRemove && <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={onRemove} aria-label="Remove guardian" />}
        </div>
      </div>

      {existing ? (
        <div className="flex items-center justify-between rounded-lg bg-brand-soft px-3 py-2 text-sm">
          <span>
            <span className="font-medium text-slate-900">{existing.fullName}</span> <span className="text-slate-600">{existing.phone}</span>
            <span className="ml-2 text-xs text-slate-500">existing parent</span>
          </span>
          <button type="button" onClick={() => onLink(null)} className="text-xs font-medium text-brand hover:underline">
            Change
          </button>
        </div>
      ) : linking ? (
        <GuardianPicker
          onPick={(g) => {
            onLink(g);
            setLinking(false);
            toast.success(`Linked ${g.fullName}`);
          }}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name">
            <Input {...register(`guardians.${index}.fullName`)} />
          </Field>
          <Field label="Mobile" hint="Used to sign in to the app">
            <Input {...register(`guardians.${index}.phone`)} placeholder="98XXXXXXXX" />
          </Field>
          <Field label="Email">
            <Input type="email" {...register(`guardians.${index}.email`)} />
          </Field>
          <Field label="Occupation">
            <Input {...register(`guardians.${index}.occupation`)} />
          </Field>
          <Field label="App password" hint={`Parent signs in to the app with school code ${schoolCode}, their mobile and this password`}>
            <div className="flex gap-2">
              <Input {...register(`guardians.${index}.password`)} placeholder="Optional" autoComplete="new-password" />
              <Button size="sm" variant="secondary" className="h-10" onClick={() => setValue(`guardians.${index}.password`, generatePassword())}>
                Generate
              </Button>
            </div>
          </Field>
          <div className="sm:col-span-2">
            <Checkbox
              {...register(`guardians.${index}.whatsappOptIn`)}
              label={
                <span>
                  Agrees to receive messages on WhatsApp <span className="text-slate-400">(fee receipts, absence alerts, notices — can opt out any time)</span>
                </span>
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}

