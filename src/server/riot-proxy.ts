import type { Request, Response } from 'express';
import { cacheService } from './cache';

const DDRAGON_BASE = 'https://ddragon.leagueoflegends.com';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}

export async function getLatestVersion(): Promise<string> {
  const cacheKey = 'ddragon:versions:latest';
  const cached = await cacheService.get(cacheKey);
  if (cached) return cached;
  const versions = await fetchJson<string[]>(`${DDRAGON_BASE}/api/versions.json`);
  const latest = Array.isArray(versions) && versions.length > 0 ? versions[0] : '';
  if (!latest) throw new Error('Unable to resolve latest version');
  // cache for 5 minutes
  await cacheService.set(cacheKey, latest, 300);
  return latest;
}

export async function handleLatestVersion(_req: Request, res: Response) {
  try {
    const v = await getLatestVersion();
    res.set('Cache-Control', 'public, max-age=60');
    return res.json({ version: v });
  } catch (e: any) {
    return res.status(500).json({ error: 'version_failed', message: e?.message || 'unknown' });
  }
}

export async function handleChampions(req: Request, res: Response) {
  try {
    const qLocale = req.query['locale'];
    const qVersion = req.query['version'];
    const locale = typeof qLocale === 'string' ? qLocale : 'en_US';
    const requestedVersion = typeof qVersion === 'string' ? qVersion.trim() : '';
    const latest = await getLatestVersion();
    const version = requestedVersion || latest;

    const key = `ddragon:champions:${version}:${locale}`;
    const cached = await cacheService.getJson<any>(key);
    if (cached) {
      res.set('X-Cache', 'HIT');
      res.set('Cache-Control', 'public, max-age=300, s-maxage=300');
      return res.json({ version, locale, data: cached });
    }

    const url = `${DDRAGON_BASE}/cdn/${version}/data/${locale}/champion.json`;
    const json = await fetchJson<any>(url);
    // store original JSON for 7 days (versioned URL rarely changes)
    await cacheService.setJson(key, json, 60 * 60 * 24 * 7);
    res.set('X-Cache', 'MISS');
    res.set('Cache-Control', 'public, max-age=300, s-maxage=300');
    return res.json({ version, locale, data: json });
  } catch (e: any) {
    return res.status(500).json({ error: 'champions_failed', message: e?.message || 'unknown' });
  }
}


