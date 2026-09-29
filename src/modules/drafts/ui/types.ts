export interface DraftHero {
  id: number;
  name: string;
  imageUrl: string | null;
  iconUrl: string | null;
  primaryAttr: "str" | "agi" | "int" | "all" | null;
  roles: string[];
  attackType: "Melee" | "Ranged" | null;
}
