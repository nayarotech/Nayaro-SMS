import { prisma } from "../../lib/prisma.js";
import { notFound } from "../../lib/errors.js";
import { pickKeys } from "../../lib/objects.js";
import { recordAudit, type Actor } from "../audit/audit.service.js";
import { DEFAULT_SETTINGS, SETTINGS, type SchoolSettings } from "./settings.registry.js";

/** Stored overrides merged over the defaults. Unknown stored keys are dropped. */
export function mergeWithDefaults(stored: unknown): SchoolSettings {
  const overrides = (stored && typeof stored === "object" ? stored : {}) as SchoolSettings;
  const merged: SchoolSettings = { ...DEFAULT_SETTINGS };
  for (const setting of SETTINGS) {
    if (setting.key in overrides) merged[setting.key] = overrides[setting.key];
  }
  return merged;
}

export async function getSchoolSettings(schoolId: string): Promise<SchoolSettings> {
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { settings: true } });
  if (!school) throw notFound("School");
  return mergeWithDefaults(school.settings);
}

export async function getSetting<T extends SchoolSettings[string]>(schoolId: string, key: string): Promise<T> {
  const settings = await getSchoolSettings(schoolId);
  return settings[key] as T;
}

/** `changes` must already be validated with settingsUpdateSchema. */
export async function updateSchoolSettings(actor: Actor, changes: SchoolSettings): Promise<SchoolSettings> {
  const school = await prisma.school.findUnique({ where: { id: actor.schoolId }, select: { settings: true } });
  if (!school) throw notFound("School");

  const before = (school.settings ?? {}) as SchoolSettings;
  const after = { ...before, ...changes };

  await prisma.school.update({ where: { id: actor.schoolId }, data: { settings: after } });
  await recordAudit(actor, {
    action: "settings.update",
    entityType: "School",
    entityId: actor.schoolId,
    oldValue: pickKeys(before, Object.keys(changes)),
    newValue: changes,
  });

  return mergeWithDefaults(after);
}
