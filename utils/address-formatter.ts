import { ShopVoxSalesOrder } from "../schemas/sales-order.schema";
import { ShopVoxQuote } from "../schemas/quote.schema";
import { WRIKE_CUSTOM_FIELDS } from "../constants/wrike-fields";

/**
 * Interface for address objects from ShopVox
 */
export interface ShopVoxAddress {
  id: string;
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  countryName?: string;
  country?: string;
  street1?: string | null;
  suburb?: string;
  nameStreet?: string;
  nameStreetCity?: string;
  countryCode?: string;
  attentionTo?: string;
}

/**
 * Formats a ShopVox address object into a readable text string
 * @param address - The address object from ShopVox
 * @returns Formatted address string
 */
export function formatAddress(
  address: ShopVoxAddress | null | undefined
): string {
  if (!address) {
    return "";
  }

  const parts: string[] = [];

  // Add attention line if present
  if (address.attentionTo) {
    parts.push(`Attn: ${address.attentionTo}`);
  }

  // Add name if present and not empty
  if (address.name && address.name.trim()) {
    parts.push(address.name);
  }

  // Add street address
  if (address.street) {
    parts.push(address.street);
  }

  // Add city, state, zip
  const cityStateZip = [address.city, address.state, address.zip]
    .filter(Boolean)
    .join(", ");

  if (cityStateZip) {
    parts.push(cityStateZip);
  }

  // Add country if present and not "United States"
  const country = address.countryName || address.country;
  if (country && country !== "United States") {
    parts.push(country);
  }

  return parts.join("\n");
}

/**
 * Gets the install address from a related quote
 * @param salesOrder - The sales order containing related transactions
 * @param shopvoxService - Service to fetch quote data
 * @returns Promise<string> - Formatted install address or empty string
 */
export async function getInstallAddressFromQuote(
  salesOrder: ShopVoxSalesOrder,
  shopvoxService: any
): Promise<string> {
  try {
    // Find the quote transaction in related transactions
    const quoteTransaction = salesOrder.relatedTransactions?.find(
      (transaction: any) => transaction.txnType === "Quote"
    );

    if (!quoteTransaction) {
      console.log("No quote transaction found in related transactions");
      return "";
    }

    // Fetch the quote using the transaction ID
    const quote = await shopvoxService.getQuote(quoteTransaction.txnId);

    if (!quote) {
      console.log("Quote not found");
      return "";
    }

    if (!quote.installingAddress) {
      console.log("No installing address found in quote");
      return "";
    }

    return formatAddress(quote.installingAddress);
  } catch (error) {
    console.error("Error fetching install address from quote:", error);
    return "";
  }
}

/**
 * Wrike custom field IDs for addresses
 * @deprecated Use WRIKE_CUSTOM_FIELDS from constants/wrike-fields.ts instead
 */
export const WRIKE_ADDRESS_FIELD_IDS = {
  SHIPPING_ADDRESS: WRIKE_CUSTOM_FIELDS.SHIPPING_ADDRESS,
  BILLING_ADDRESS: WRIKE_CUSTOM_FIELDS.BILLING_ADDRESS,
  INSTALL_ADDRESS: WRIKE_CUSTOM_FIELDS.INSTALL_ADDRESS,
} as const;
