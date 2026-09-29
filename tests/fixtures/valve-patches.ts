/**
 * Trimmed Valve datafeed payloads (shapes verified against the live feed, Sep 2026).
 * Entries are cut down to a handful; wording is illustrative.
 */
export const PATCH_LIST = {
  success: true,
  patches: [
    { patch_number: "7.40", patch_name: "7.40", patch_timestamp: 1765785600 },
    { patch_number: "7.41", patch_name: "7.41", patch_timestamp: 1774335600 },
    { patch_number: "7.41e", patch_name: "7.41e", patch_timestamp: 1785394800 },
    { patch_number: "7.41f", patch_name: "7.41f", patch_timestamp: 1789455600 },
    { patch_number: "7.41a", patch_name: "7.41a", patch_timestamp: 1775000000 },
  ],
};

export function patchDetail(
  version = "7.41",
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    patch_number: version,
    patch_name: version,
    patch_timestamp: 1774335600,
    general_notes: [
      {
        title: "Map Objectives",
        generic: [
          { indent_level: 1, hide_dot: true, note: '<span class="Subtitle">Tormentor</span>' },
          {
            indent_level: 1,
            note: "Tormentor's spawn preference has switched",
            info: "Now begins in the Bottom Chasm",
          },
          { indent_level: 1, hide_dot: true, note: "<br>" },
        ],
      },
    ],
    items: [
      {
        ability_id: -1,
        title: "Shop Reshuffle",
        is_general_note: true,
        ability_notes: [{ indent_level: 1, note: "Consumables now includes Infused Raindrops" }],
      },
      {
        ability_id: 1,
        postfix_lines: 1,
        ability_notes: [
          {
            indent_level: 1,
            note: "<font color='#e03e2e'>Cooldown</font> increased from 15 to 16<br>Applies to illusions ",
          },
        ],
      },
    ],
    neutral_items: [
      {
        ability_id: 1596,
        ability_notes: [{ indent_level: 1, note: "Bonus Damage decreased from 12 to 10" }],
      },
    ],
    heroes: [
      {
        hero_id: 1,
        hero_notes: [{ indent_level: 1, note: "Base Armor increased by 1", icon: "armor" }],
        talent_notes: [{ indent_level: 1, note: "Level 20 Talent +150 Blink Cast Range" }],
        abilities: [
          {
            ability_id: 5003,
            ability_notes: [
              { indent_level: 1, note: "Now upgraded with Aghanim's Scepter", aghanims: "scepter" },
              { indent_level: 2, note: "Increases Max Mana Burned per hit by 1.5%" },
            ],
          },
          { ability_id: 999999, ability_notes: [{ indent_level: 1, note: "Radius increased" }] },
        ],
      },
      {
        hero_id: 14,
        abilities: [{ ability_id: 5075, ability_notes: [{ indent_level: 1, note: "Hook fixed" }] }],
      },
    ],
    neutral_creeps: [
      {
        name: "npc_dota_neutral_kobold_taskmaster",
        localized_name: "Kobold Foreman",
        neutral_creep_notes: [{ indent_level: 1, note: "Damage increased from 22–24 to 24–26" }],
      },
    ],
    success: true,
    ...overrides,
  };
}

/** OpenDota constants, trimmed. */
export const ABILITY_IDS = { "5003": "antimage_mana_break", "5075": "pudge_meat_hook" };
export const ABILITIES = {
  antimage_mana_break: {
    dname: "Mana Break",
    img: "/apps/dota2/images/dota_react/abilities/antimage_mana_break.png",
  },
  pudge_meat_hook: { dname: "Meat Hook", img: "https://evil.example/hook.png" },
};
export const ITEM_IDS = { "1": "blink", "1596": "occult_bracelet" };
export const ITEMS = {
  blink: {
    id: 1,
    dname: "Blink Dagger",
    img: "/apps/dota2/images/dota_react/items/blink.png?t=1593393829403",
  },
  occult_bracelet: { id: 1596, dname: "Occult Bracelet" },
};
