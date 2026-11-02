// Minimal typing for the part of bidi-js used by the report PDF.
declare module 'bidi-js' {
  interface Bidi {
    getEmbeddingLevels(text: string, direction?: 'ltr' | 'rtl' | 'auto'): { levels: Uint8Array; paragraphs: { start: number; end: number; level: number }[] };
  }
  export default function bidiFactory(): Bidi;
}
