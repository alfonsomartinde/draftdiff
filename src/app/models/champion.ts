export interface ChampionDto {
  id: string; // e.g., "Aatrox"
  key: string; // numeric string
  name: string;
  image: { full: string };
}

export interface ChampionItem {
  id: number; // numeric id from key
  name: string;
  loadingImage: string; // absolute url
  squareImage: string; // absolute url
  splashImage: string; // absolute url
}
