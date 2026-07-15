export type ProductImageFolderType = 'product-images' | 'gallery-images';

/** Sanitize a path segment for Cloudinary folders. */
export function slugifyFolderSegment(value: string, fallback = 'untitled'): string {
  const cleaned = value
    .trim()
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

  return cleaned || fallback;
}

/**
 * Build structured Cloudinary folder path:
 * products/{Category}/{ProductName}/{product-images|gallery-images}
 */
export function buildProductMediaFolder(
  categoryName: string,
  productName: string,
  type: ProductImageFolderType,
): string {
  const category = slugifyFolderSegment(categoryName, 'uncategorized');
  const product = slugifyFolderSegment(productName, 'product');
  return `products/${category}/${product}/${type}`;
}
