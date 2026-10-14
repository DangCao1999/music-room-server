import {
  DEFAULT_SETTINGS,
  type RoomSettings,
  RoomSettingsSchema,
} from '../contracts';

/** Stored JSON → full settings (unknown or invalid stored values fall back to defaults). */
export function readSettings(raw: unknown): RoomSettings {
  const merged = {
    ...DEFAULT_SETTINGS,
    ...(raw && typeof raw === 'object' ? raw : {}),
  };
  const parsed = RoomSettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}
