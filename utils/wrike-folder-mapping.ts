/**
 * User mapping between ShopVox and Wrike systems
 * Maps ShopVox user IDs to Wrike Folder IDs
 */

export interface WrikeFolderMapping {
  name: string;
  shopVoxUserId: string;
  wrikeFolderId: {
    forWosos: string;
    forQuotes: string;
  };
}

export const SHOPVOX_WRIKE_FOLDER_MAPPING: WrikeFolderMapping[] = [
  {
    name: "Adam Canady",
    shopVoxUserId: "81bed714-0ed1-4bfa-a5cd-64ad3e5cbc59",
    wrikeFolderId: {
      forWosos: "MQAAAABnvRlb",
      forQuotes: "MQAAAABnvRi1",
    },
  },
  {
    name: "Baxter W Wilson",
    shopVoxUserId: "d96c57a2-47dd-4aff-8000-e532f9a5cb81",
    wrikeFolderId: {
      forWosos: "MQAAAABow4OM",
      forQuotes: "MQAAAABow4Ni",
    },
  },
  {
    name: "Cowles Self",
    shopVoxUserId: "3ba06b8f-1ba5-432d-b122-082dd70684cb",
    wrikeFolderId: {
      forWosos: "MQAAAABpTlGK",
      forQuotes: "MQAAAABpTlEj",
    },
  },
  {
    name: "Erik Joncas",
    shopVoxUserId: "0a7ad1d5-9519-40ed-b59f-7d9b0e4af834",
    wrikeFolderId: {
      forWosos: "MQAAAABonRo2",
      forQuotes: "MQAAAABonRl3",
    },
  },
  {
    name: "Isaac Rico",
    shopVoxUserId: "037c530d-e76f-4a2b-8aed-b10705754402",
    wrikeFolderId: {
      forWosos: "MQAAAABpTjyT",
      forQuotes: "MQAAAABpTjx4",
    },
  },
  {
    name: "Jayme Proctor",
    shopVoxUserId: "949f42b5-27dc-4bb8-9a12-1b913df19871",
    wrikeFolderId: {
      forWosos: "MQAAAABpTj0I",
      forQuotes: "MQAAAABpTjzo",
    },
  },
  {
    name: "Kyle Gahm",
    shopVoxUserId: "4c0c7660-d5ec-4f89-a309-dcccbfb649d5",
    wrikeFolderId: {
      forWosos: "MQAAAABpTkFN",
      forQuotes: "MQAAAABpTj-l",
    },
  },
  {
    name: "Scott Turbide",
    shopVoxUserId: "3f5eafed-011e-4ec1-913e-1329685e7419",
    wrikeFolderId: {
      forWosos: "MQAAAABpTkhi",
      forQuotes: "MQAAAABpTkeX",
    },
  },
  {
    name: "Frank Malvossi",
    shopVoxUserId: "e54f9029-626e-4832-8019-3376b3b29259",
    wrikeFolderId: {
      forWosos: "MQAAAABpTjLl",
      forQuotes: "MQAAAABpTjKs",
    },
  },
  {
    name: "Jeff Michaud",
    shopVoxUserId: "f08c048c-7c5f-4b5d-a6dd-b24e7a188329",
    wrikeFolderId: {
      forWosos: "MQAAAABpTjPF",
      forQuotes: "MQAAAABpTjNW",
    },
  },
  {
    name: "Morgan Foote",
    shopVoxUserId: "fc8659ee-6f67-40b6-ab69-79afae1525a2",
    wrikeFolderId: {
      forWosos: "MQAAAABpTjbV",
      forQuotes: "MQAAAABpTjab",
    },
  },
  {
    name: "Nick Desilets",
    shopVoxUserId: "ca379abc-08b0-402e-9d15-1789041b3c08",
    wrikeFolderId: {
      forWosos: "MQAAAABpTjfW",
      forQuotes: "MQAAAABpTjeL",
    },
  },
  {
    name: "Sean Murphy",
    shopVoxUserId: "559544df-621a-40bf-b329-07dbee56dd8c",
    wrikeFolderId: {
      forWosos: "MQAAAABpTjkY",
      forQuotes: "MQAAAABpTjjU",
    },
  },
];
