/** Austen Reader Publication Profile — EPUB 3 extension version. */
export const ARPP_VERSION = 1 as const;

/** OPF `meta property` for profile version (custom vocabulary). */
export const ARPP_META_PROPERTY = "arpp:version";

/** HTML attribute on quoted spans: value is a key in `metadata/characters.json`. */
export const ARPP_SPEAKER_ATTR = "data-ar-speaker";

/** Paragraph continues mid-speech (maps to book JSON `{ text, c: true }`). */
export const ARPP_CONTINUATION_ATTR = "data-ar-dialogue-continuation";

export const ARPP_PROFILE_URI = "https://github.com/austen-reader/arpp";
