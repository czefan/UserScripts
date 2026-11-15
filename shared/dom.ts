export interface InjectStyleOptions {
  id?: string;
  doc?: Document;
}

export function injectStyle(
  css: string,
  options: InjectStyleOptions = {},
): HTMLStyleElement {
  const doc = options.doc ?? document;
  if (options.id) {
    const existing = doc.getElementById(options.id);
    if (existing instanceof HTMLStyleElement) {
      return existing;
    }
  }

  const style = doc.createElement('style');
  if (options.id) {
    style.id = options.id;
  }
  style.textContent = css;
  (doc.head || doc.documentElement).appendChild(style);
  return style;
}
