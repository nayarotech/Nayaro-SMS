/** Shapes returned by the API, shared across features. */

export type SettingValue = boolean | number | string | string[];
export type SchoolSettings = Record<string, SettingValue>;

export interface CurrentUser {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  photoUrl: string | null;
  preferredLanguage: "en" | "ne";
  isSuperAdmin: boolean;
  hasPassword: boolean;
  roles: { key: string; name: string }[];
  permissions: string[];
  school: {
    id: string;
    name: string;
    code: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    logoUrl: string | null;
  } | null;
  settings: SchoolSettings | null;
}

export type LoginResult =
  | { status: "ok"; accessToken: string }
  | {
      status: "select_school";
      selectionToken: string;
      accounts: { userId: string; schoolName: string; schoolCode: string }[];
    };
