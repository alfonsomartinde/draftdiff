import { TRANSPARENT_PIXEL_GIF } from '@app/constants/images';

export type ImageInfo = {
  squareImage: string;
  loadingImage: string;
  splashImage: string;
};

/**
 * Returns splash image URL from a record map or a 1x1 fallback when missing.
 */
export function splashFromMap(
  map: Record<number, ImageInfo> | undefined | null,
  id: number | null,
): string {
  if (id == null) return TRANSPARENT_PIXEL_GIF;
  const img = map?.[id];
  return img?.splashImage ?? TRANSPARENT_PIXEL_GIF;
}

/**
 * Returns square image URL from a record map or a 1x1 fallback when missing.
 */
export function squareFromMap(
  map: Record<number, ImageInfo> | undefined | null,
  id: number | null,
): string {
  if (id == null) return TRANSPARENT_PIXEL_GIF;
  const img = map?.[id];
  return img?.squareImage ?? TRANSPARENT_PIXEL_GIF;
}

/**
 * Returns loading image URL from a record map or a 1x1 fallback when missing.
 */
export function loadingFromMap(
  map: Record<number, ImageInfo> | undefined | null,
  id: number | null,
): string {
  if (id == null) return TRANSPARENT_PIXEL_GIF;
  const img = map?.[id];
  return img?.loadingImage ?? TRANSPARENT_PIXEL_GIF;
}

/**
 * Returns splash image URL using a resolver function or a 1x1 fallback when missing.
 */
export function splashFromResolver(
  resolver: ((id: number | null) => ImageInfo | null) | undefined,
  id: number | null,
): string {
  if (id == null) return TRANSPARENT_PIXEL_GIF;
  const img = resolver ? resolver(id) : null;
  return img?.splashImage ?? TRANSPARENT_PIXEL_GIF;
}

/**
 * Returns square image URL using a resolver function or a 1x1 fallback when missing.
 */
export function squareFromResolver(
  resolver: ((id: number | null) => { squareImage: string } | null) | undefined,
  id: number | null,
): string {
  if (id == null) return TRANSPARENT_PIXEL_GIF;
  const img = resolver ? resolver(id) : null;
  return img?.squareImage ?? TRANSPARENT_PIXEL_GIF;
}

/**
 * Returns loading image URL using a resolver function or a 1x1 fallback when missing.
 */
export function loadingFromResolver(
  resolver: ((id: number | null) => ImageInfo | null) | undefined,
  id: number | null,
): string {
  if (id == null) return TRANSPARENT_PIXEL_GIF;
  const img = resolver ? resolver(id) : null;
  return img?.loadingImage ?? TRANSPARENT_PIXEL_GIF;
}


