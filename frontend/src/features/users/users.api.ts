export interface UserListItem {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  photoUrl: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  designation: string | null;
  employeeId: string | null;
  isStaff: boolean;
  roles: { id: string; key: string; name: string }[];
}

export interface StaffProfile {
  employeeId: string | null;
  designation: string | null;
  gender: "MALE" | "FEMALE" | "OTHER" | null;
  dateOfBirth: string | null;
  joinDate: string | null;
  qualification: string | null;
  address: string | null;
}

export interface UserDetail extends UserListItem {
  staffProfile: StaffProfile | null;
  hasPassword: boolean;
  permissionOverrides: { permission: string; effect: "GRANT" | "DENY" }[];
  effectivePermissions: string[];
  teaching: { subject: string; classSection: string }[];
  classTeacherOf: string[];
}
