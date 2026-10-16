import {
  DEFAULT_SETTINGS,
  type RoomSettings,
  RoomSettingsSchema,
  THEME_IDS,
} from '../contracts';

/** Stored JSON → full settings (unknown or invalid stored values fall back to defaults). */
export function readSettings(raw: unknown): RoomSettings {
  const merged: Record<string, unknown> = {
    ...DEFAULT_SETTINGS,
    ...(raw && typeof raw === 'object' ? raw : {}),
  };
  // A theme that no longer exists only resets the theme, never the other settings.
  if (!(THEME_IDS as readonly unknown[]).includes(merged.theme))
    merged.theme = DEFAULT_SETTINGS.theme;
  const parsed = RoomSettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}
