import type { StaffFormValues } from "./StaffForm";

/** Converts form values into the API's shape ("" → null). */
export function toStaffPayload(values: StaffFormValues, creating: boolean) {
  const nullable = (v: string) => (v.trim() ? v.trim() : null);
  const sp = values.staffProfile;
  return {
    fullName: values.fullName,
    email: nullable(values.email),
    phone: nullable(values.phone),
    staffProfile: {
      employeeId: nullable(sp.employeeId),
      designation: nullable(sp.designation),
      gender: sp.gender || null,
      dateOfBirth: sp.dateOfBirth || null,
      joinDate: sp.joinDate || null,
      qualification: nullable(sp.qualification),
      address: nullable(sp.address),
    },
    ...(creating && { roleIds: values.roleIds, password: nullable(values.password) }),
  };
}
