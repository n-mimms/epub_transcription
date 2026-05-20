/** Canonical book JSON shape (authoring + ARPP export/import). */

export type ParagraphCell = string | { text: string; c?: boolean };

export interface Chapter {
  title: string;
  paragraphs: ParagraphCell[];
}

export interface Book {
  id: string;
  title: string;
  author: string;
  chapters: Chapter[];
}
