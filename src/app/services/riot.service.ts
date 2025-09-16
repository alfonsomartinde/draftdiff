import { Injectable } from '@angular/core';
import { ChampionDto, ChampionItem } from '@models/champion';

/**
 * RiotService
 *
 * Client-side service to fetch champions and versions. In SSR/production we
 * prefer hitting our own proxy endpoints (`/api/versions/latest`, `/api/champions`)
 * which are Redis-backed to ensure stability and performance across replicas.
 */
@Injectable({ providedIn: 'root' })
export class RiotService {
  private readonly ddragonBase = 'https://ddragon.leagueoflegends.com/cdn';
  private readonly communityDragonBase = 'https://cdn.communitydragon.org/latest/champion';
  // Use SSR proxy endpoints to benefit from Redis cache
  private readonly latestVersionUrl = '/api/versions/latest';
  private readonly championsUrl = '/api/champions';
  private readonly cache = new Map<string, unknown>();

  /** Resolve latest DDragon version via SSR proxy. */
  async getLatestVersion(): Promise<string> {
    const resp = (await this.getJson<{ version: string }>(this.latestVersionUrl)) ?? {
      version: '',
    };
    if (!resp?.version) throw new Error('Unable to resolve Data Dragon versions');
    return resp.version;
  }

  /**
   * Fetch champions for a given version and locale.
   * Maps DDragon DTOs into `ChampionItem` with normalized fields and URLs.
   */
  async getChampions(options?: { version?: string; locale?: string }): Promise<ChampionItem[]> {
    const version = options?.version ?? (await this.getLatestVersion());
    const locale = options?.locale ?? 'en_US';
    const url = `${this.championsUrl}?version=${encodeURIComponent(version)}&locale=${encodeURIComponent(
      locale,
    )}`;
    const resp = (await this.getJson<any>(url)) ?? { data: { data: {} } };
    const data = resp?.data ?? { data: {} };
    const champions: ChampionItem[] = Object.values<ChampionDto>(data.data).map((c) => ({
      id: Number(c.key),
      name: c.id,
      loadingImage: `${this.communityDragonBase}/${Number(c.key)}/splash-art/centered/skin/0`,
      squareImage: `${this.ddragonBase}/${version}/img/champion/${c.image.full}`,
      splashImage: `${this.communityDragonBase}/${Number(c.key)}/splash-art/centered/skin/0`,
    }));
    champions.sort((a, b) => a.name.localeCompare(b.name));
    return champions;
  }

  clearCache(): void {
    this.cache.clear();
  }

  /** Small fetch + JSON wrapper with in-memory request cache for the session. */
  private async getJson<T>(url: string): Promise<T | undefined> {
    if (this.cache.has(url)) return this.cache.get(url) as T;
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const json = (await res.json()) as T;
    this.cache.set(url, json);
    return json;
  }
}
