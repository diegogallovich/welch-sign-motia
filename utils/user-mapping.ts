/**
 * User mapping between ShopVox and Wrike systems
 * Maps ShopVox user IDs to Wrike user IDs
 */

export interface UserMapping {
  name: string;
  shopVoxUserId: string;
  wrikeUserId: string;
  wrikeApiV2Id?: string; // Legacy Wrike API v2 ID (optional)
}

export const SHOPVOX_WRIKE_USER_MAPPING: UserMapping[] = [
  {
    name: "Tom Heskett",
    shopVoxUserId: "847ee020-5cab-47df-a5eb-226ae7901455",
    wrikeUserId: "KUATJIS2",
    wrikeApiV2Id: "Axga3MMeNF8W",
  },
  {
    name: "Adam Canady",
    shopVoxUserId: "81bed714-0ed1-4bfa-a5cd-64ad3e5cbc59",
    wrikeUserId: "KUAUNR4P",
    wrikeApiV2Id: "gMhi97h2l60N",
  },
  {
    name: "Allison Sinnett",
    shopVoxUserId: "2285aa05-c945-4682-9787-a090bff5ebad",
    wrikeUserId: "KUATWBUA",
    wrikeApiV2Id: "bobJTdkI9Eo6",
  },
  {
    name: "Beth Williams",
    shopVoxUserId: "9625ed25-07c9-4d80-9803-c2b9558f2f70",
    wrikeUserId: "KUAIIJPC",
    wrikeApiV2Id: "y8hG80cSGDBz",
  },
  {
    name: "Buddy Williams",
    shopVoxUserId: "ff0113ab-c0d8-491b-981a-07a9edc302c1",
    wrikeUserId: "KUAVI3U2",
    wrikeApiV2Id: "rikm8T4phNvm",
  },
  {
    name: "Cowles Self",
    shopVoxUserId: "3ba06b8f-1ba5-432d-b122-082dd70684cb",
    wrikeUserId: "KUAUNFRL",
    wrikeApiV2Id: "DEPzts5Jb8UL",
  },
  {
    name: "Deanna Emery",
    shopVoxUserId: "6df69646-98fa-4c13-87a7-cb82503fad00",
    wrikeUserId: "KUATIDV4",
    wrikeApiV2Id: "3m7ATQ9keXc2",
  },
  {
    name: "Diego Gallovich",
    shopVoxUserId: "df6e9531-0157-49f2-b12d-df76393b452e",
    wrikeUserId: "KUAVYLX5",
    wrikeApiV2Id: "K2sTf26lLEl6",
  },
  {
    name: "Erik Joncas",
    shopVoxUserId: "0a7ad1d5-9519-40ed-b59f-7d9b0e4af834",
    wrikeUserId: "KUAIINDI",
    wrikeApiV2Id: "JQGtN3MIapRq",
  },
  {
    name: "Frank Malvossi",
    shopVoxUserId: "e54f9029-626e-4832-8019-3376b3b29259",
    wrikeUserId: "KUASSV4S",
    wrikeApiV2Id: "Uv45ZRonvRmo",
  },
  {
    name: "Gregg Davey",
    shopVoxUserId: "4403ed3e-fb23-45bb-83af-2427e4c1f073",
    wrikeUserId: "KUAIJNAD",
    wrikeApiV2Id: "ERmEKC52Wi0b",
  },
  {
    name: "Isaac Rico",
    shopVoxUserId: "037c530d-e76f-4a2b-8aed-b10705754402",
    wrikeUserId: "KUATJHVJ",
    wrikeApiV2Id: "h2js8GYDtDyT",
  },
  {
    name: "Jayme Proctor",
    shopVoxUserId: "949f42b5-27dc-4bb8-9a12-1b913df19871",
    wrikeUserId: "KUAUVQGU",
    wrikeApiV2Id: "BjmI4GdKpIvB",
  },
  {
    name: "Jeff Michaud",
    shopVoxUserId: "f08c048c-7c5f-4b5d-a6dd-b24e7a188329",
    wrikeUserId: "KUASSV4P",
    wrikeApiV2Id: "USyfHdrl28zH",
  },
  {
    name: "Kyle Gahm",
    shopVoxUserId: "4c0c7660-d5ec-4f89-a309-dcccbfb649d5",
    wrikeUserId: "KUATISBM",
    wrikeApiV2Id: "KggintUZZXCC",
  },
  {
    name: "Lance Rogers",
    shopVoxUserId: "03ec37ee-1247-499f-b8a5-23d06a1dbe7f",
    wrikeUserId: "KUATHPK4",
    wrikeApiV2Id: "gWX05amX5Xpm",
  },
  {
    name: "Laurie White",
    shopVoxUserId: "0ca9becd-0807-4f4c-9aef-93a612f3100f",
    wrikeUserId: "KUASXTCX",
    wrikeApiV2Id: "NCZomDRHSaMk",
  },
  {
    name: "Morgan Foote",
    shopVoxUserId: "fc8659ee-6f67-40b6-ab69-79afae1525a2",
    wrikeUserId: "KUAIIJ76",
    wrikeApiV2Id: "RWGsAQlUGYWx",
  },
  {
    name: "Nathan Bertan",
    shopVoxUserId: "3ce4b65a-a6a9-4063-8132-7e0afdda3b02",
    wrikeUserId: "KUAUD4IS",
    wrikeApiV2Id: "g2KObPxePjIc",
  },
  {
    name: "Nick Desilets",
    shopVoxUserId: "ca379abc-08b0-402e-9d15-1789041b3c08",
    wrikeUserId: "KUASSVR2",
    wrikeApiV2Id: "vMDyBQuDJCwq",
  },
  {
    name: "Nicole Maguire",
    shopVoxUserId: "b1465430-03db-4343-99ec-a0918865a1a4",
    wrikeUserId: "KUASNFLS",
    wrikeApiV2Id: "CnbAC9R2KS1F",
  },
  {
    name: "Sarah Coggeshall",
    shopVoxUserId: "ab74aebb-5b8e-43e9-96c3-72aacfd70033",
    wrikeUserId: "KUATIEHY",
    wrikeApiV2Id: "6zwlc6c3gV97",
  },
  {
    name: "Scott Turbide",
    shopVoxUserId: "3f5eafed-011e-4ec1-913e-1329685e7419",
    wrikeUserId: "KUATEHED",
    wrikeApiV2Id: "wq7zoEoaH2p6",
  },
  {
    name: "Sean Murphy",
    shopVoxUserId: "559544df-621a-40bf-b329-07dbee56dd8c",
    wrikeUserId: "KUATZFAN",
    wrikeApiV2Id: "rX4jGvE9Hv35",
  },
  {
    name: "Andy Dennis",
    shopVoxUserId: "2947d1da-3ed1-434d-8db9-2c80457db751",
    wrikeUserId: "KUAWAU6Z",
    wrikeApiV2Id: "MMAj0ZE9g8sU",
  },
  {
    name: "Baxter W Wilson",
    shopVoxUserId: "d96c57a2-47dd-4aff-8000-e532f9a5cb81",
    wrikeUserId: "KUAWBVMR",
    wrikeApiV2Id: "RL1l1UJlpq8v",
  },
  {
    name: "Christine Nickerson",
    shopVoxUserId: "2f95250b-cb58-47dd-b997-bd4cb00f06e8",
    wrikeUserId: "KUAWAUU5",
    wrikeApiV2Id: "KVV8MXJtCjHS",
  },
  {
    name: "Michael Head",
    shopVoxUserId: "b30c95a2-939b-44cb-8e8f-564d1cd0394c",
    wrikeUserId: "KUAWAVEQ",
    wrikeApiV2Id: "13NgH2ImiERy",
  },
  {
    name: "Neill Ewing-Wegmann",
    shopVoxUserId: "5b9628fe-6385-44f5-8e92-1f72dd76e9fe",
    wrikeUserId: "KUAWAUUX",
    wrikeApiV2Id: "zvfuOJNDZWmf",
  },
];

/**
 * Default fallback user (Diego Gallovich)
 */
export const DEFAULT_WRIKE_USER_ID = "KUAVYLX5";

/**
 * Maps a ShopVox user ID to a Wrike user ID
 * Falls back to Diego Gallovich if no mapping is found
 *
 * @param shopVoxUserId - The ShopVox user ID to map
 * @returns The corresponding Wrike user ID
 */
export function mapShopVoxToWrikeUserId(shopVoxUserId: string): string {
  const mapping = SHOPVOX_WRIKE_USER_MAPPING.find(
    (user) => user.shopVoxUserId === shopVoxUserId
  );

  if (mapping) {
    return mapping.wrikeUserId;
  }

  // Log warning for unmapped users
  console.warn(
    `[UserMapping] No Wrike user mapping found for ShopVox user ID: ${shopVoxUserId}. Falling back to Diego Gallovich (${DEFAULT_WRIKE_USER_ID})`
  );

  return DEFAULT_WRIKE_USER_ID;
}

/**
 * Maps a legacy Wrike API v2 ID to the current Wrike user ID
 * Falls back to Diego Gallovich if no mapping is found
 *
 * @param wrikeApiV2Id - The legacy Wrike API v2 ID to map
 * @returns The corresponding current Wrike user ID
 */
export function mapWrikeApiV2IdToUserId(wrikeApiV2Id: string): string {
  const mapping = SHOPVOX_WRIKE_USER_MAPPING.find(
    (user) => user.wrikeApiV2Id === wrikeApiV2Id
  );

  if (mapping) {
    return mapping.wrikeUserId;
  }

  // Log warning for unmapped users
  console.warn(
    `[UserMapping] No Wrike user mapping found for API v2 ID: ${wrikeApiV2Id}. Falling back to Diego Gallovich (${DEFAULT_WRIKE_USER_ID})`
  );

  return DEFAULT_WRIKE_USER_ID;
}

/**
 * Maps a legacy Wrike API v2 ID to ShopVox user ID
 * Falls back to Diego Gallovich's ShopVox ID if no mapping is found
 *
 * @param wrikeApiV2Id - The legacy Wrike API v2 ID to map
 * @returns The corresponding ShopVox user ID
 */
export function mapWrikeApiV2IdToShopVoxUserId(wrikeApiV2Id: string): string {
  const mapping = SHOPVOX_WRIKE_USER_MAPPING.find(
    (user) => user.wrikeApiV2Id === wrikeApiV2Id
  );

  if (mapping) {
    return mapping.shopVoxUserId;
  }

  // Log warning for unmapped users
  console.warn(
    `[UserMapping] No ShopVox user mapping found for API v2 ID: ${wrikeApiV2Id}. Falling back to Diego Gallovich`
  );

  return "df6e9531-0157-49f2-b12d-df76393b452e"; // Diego's ShopVox ID
}
