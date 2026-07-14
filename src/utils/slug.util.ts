export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function uniqueSlug(base: string, existing: string[]): string {
  let slug = slugify(base);
  let counter = 1;
  while (existing.includes(slug)) {
    slug = `${slugify(base)}-${counter}`;
    counter += 1;
  }
  return slug;
}
