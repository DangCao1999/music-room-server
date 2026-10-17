import type { Voice } from '../contracts';

const VIETNAMESE_MARKS =
  /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;

/** True when the text has at least one Vietnamese letter with a mark: it is Vietnamese. */
export function hasVietnameseMarks(text: string): boolean {
  return VIETNAMESE_MARKS.test(text);
}

/** The stored wish voice; anything else (older presets, empty) reads as male. */
export function voiceOf(stored: string | null | undefined): Voice {
  return stored === 'female' ? 'female' : 'male';
}
