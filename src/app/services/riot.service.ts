import { Injectable } from '@angular/core';
import { ChampionDto, ChampionItem } from '@models/champion';

@Injectable({ providedIn: 'root' })
export class RiotService {
  private readonly ddragonBase = 'https://ddragon.leagueoflegends.com/cdn';
  private readonly communityDragonBase = 'https://cdn.communitydragon.org/latest/champion';
  private readonly versionsUrl = 'https://ddragon.leagueoflegends.com/api/versions.json';
  private readonly cache = new Map<string, unknown>();

  async getLatestVersion(): Promise<string> {
    const versions = (await this.getJson<string[]>(this.versionsUrl)) ?? [];
    if (!Array.isArray(versions) || versions.length === 0) {
      throw new Error('Unable to resolve Data Dragon versions');
    }
    return versions[0];
  }

  async getChampions(options?: { version?: string; locale?: string }): Promise<ChampionItem[]> {
    const version = options?.version ?? (await this.getLatestVersion());
    const locale = options?.locale ?? 'en_US';
    const url = `${this.ddragonBase}/${version}/data/${locale}/champion.json`;
    const data = (await this.getJson<any>(url)) ?? { data: {} };
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

  private async getJson<T>(url: string): Promise<T | undefined> {
    if (this.cache.has(url)) return this.cache.get(url) as T;
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const json = (await res.json()) as T;
    this.cache.set(url, json);
    return json;
  }
}
