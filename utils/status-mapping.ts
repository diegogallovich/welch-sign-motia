/**
 * Status mapping between ShopVox and Wrike systems
 * Maps ShopVox workflow status names to Wrike custom status IDs
 */

export interface StatusMapping {
    shopVoxStatusName: string;
    wrikeStatusId: string;
}

/**
 * Status mapping between ShopVox and Wrike systems
 * Maps ShopVox workflow status names to Wrike custom status IDs
 */
export const SHOPVOX_WRIKE_STATUS_MAPPING: StatusMapping[] = [
    {
        shopVoxStatusName: "draft",
        wrikeStatusId: "IEADYYMRJMGGGFXI"
    },
    {
        shopVoxStatusName: "expired",
        wrikeStatusId: "IEADYYMRJMGGGFYJ"
    },
    {
        shopVoxStatusName: "hold",
        wrikeStatusId: "IEADYYMRJMGGGGMI"
    },
    {
        shopVoxStatusName: "ordered",
        wrikeStatusId: "IEADYYMRJMGGGFXJ"
    },
    {
        shopVoxStatusName: "customer_review",
        wrikeStatusId: "IEADYYMRJMGGGFXS"
    },
    {
        shopVoxStatusName: "approved",
        wrikeStatusId: "IEADYYMRJMGGGFX4"
    },
    {
        shopVoxStatusName: "approved_with_changes",
        wrikeStatusId: "IEADYYMRJMGGGGL4"
    },
    {
        shopVoxStatusName: "void",
        wrikeStatusId: "IEADYYMRJMGGGGNH"
    },
    {
        shopVoxStatusName: "revise",
        wrikeStatusId: "IEADYYMRJMGG5SYK"
    }
];

/**
 * New status ID for newly created quotes (not from quote-updated events)
 */
export const NEW_WRIKE_STATUS_ID = "IEADYYMRJMGGGFXI";

/**
 * Default fallback status (draft)
 */
export const DEFAULT_WRIKE_STATUS_ID = "IEADYYMRJMGHKPXK";

/**
 * Maps a ShopVox workflow status to a Wrike custom status ID
 * Falls back to draft status if no mapping is found
 * 
 * @param shopVoxStatusName - The ShopVox workflow status name to map
 * @returns The corresponding Wrike custom status ID
 */
export function mapShopVoxToWrikeStatusId(shopVoxStatusName: string): string {
    const mapping = SHOPVOX_WRIKE_STATUS_MAPPING.find(status => status.shopVoxStatusName === shopVoxStatusName);
    
    if (mapping) {
        return mapping.wrikeStatusId;
    }
    
    // Log warning for unmapped statuses
    console.warn(`[StatusMapping] No Wrike status mapping found for ShopVox status: ${shopVoxStatusName}. Falling back to draft status (${DEFAULT_WRIKE_STATUS_ID})`);
    
    return DEFAULT_WRIKE_STATUS_ID;
}
