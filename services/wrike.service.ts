import { ShopVoxQuote } from "../schemas/quote.schema";
import { ShopVoxSalesOrder } from "../schemas/sales-order.schema";
import { mapShopVoxToWrikeUserId } from "../utils/user-mapping";
import { mapShopVoxToWrikeStatusId } from "../utils/status-mapping";
import {
  formatAddress,
  getInstallAddressFromQuote,
  ShopVoxAddress,
  WRIKE_ADDRESS_FIELD_IDS,
} from "../utils/address-formatter";
import { shopvoxService } from "./shopvox.service";
// import { mapShopVoxUserIdToWrikeFolderMapping } from "utils/wrike-folder-mapping";

export interface WrikeTask {
  id: string;
  title: string;
  [key: string]: any;
}

export interface WrikeTaskSearchResult {
  data: WrikeTask[];
}

export interface WrikeTaskCreateResponse {
  data: WrikeTask[];
}

export interface WrikeTaskUpdateResponse {
  data: WrikeTask[];
}

export class WrikeService {
  private readonly baseUrl = "https://www.wrike.com/api/v4";
  private readonly authToken: string;
  private readonly quotesDbId: string;
  private readonly wososDbId: string;
  private readonly requestTimeout: number = 30000; // 30 seconds
  private readonly maxRetries: number = 3;
  private readonly retryDelay: number = 1000; // 1 second

  constructor() {
    this.authToken = process.env.WRIKE_PERMANENT_TOKEN!;
    this.quotesDbId = process.env.WRIKE_QUOTES_DB_ID!;
    this.wososDbId = process.env.WRIKE_WOSOS_DB_ID!;

    if (!this.authToken || !this.quotesDbId || !this.wososDbId) {
      throw new Error(
        "Missing required Wrike environment variables: WRIKE_PERMANENT_TOKEN, WRIKE_QUOTES_DB_ID, WRIKE_WOSOS_DB_ID"
      );
    }
  }

  private getHeaders() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.authToken}`,
    };
  }

  /**
   * Makes an HTTP request with timeout and retry logic
   */
  private async makeRequest(
    url: string,
    options: RequestInit = {},
    retryCount: number = 0
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          ...this.getHeaders(),
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      // Check if it's a timeout or connection error that we should retry
      const shouldRetry =
        error instanceof Error &&
        (error.name === "AbortError" ||
          error.message.includes("fetch failed") ||
          error.message.includes("timeout") ||
          error.message.includes("ECONNRESET") ||
          error.message.includes("ENOTFOUND"));

      if (shouldRetry && retryCount < this.maxRetries) {
        console.log(
          `Request failed, retrying... (attempt ${retryCount + 1}/${
            this.maxRetries
          })`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, this.retryDelay * (retryCount + 1))
        );
        return this.makeRequest(url, options, retryCount + 1);
      }

      throw error;
    }
  }

  /**
   * Sanitizes a value for Wrike custom fields according to their API requirements:
   * - Removes control characters (U+0000 through U+001F)
   * - Ensures proper JSON string escaping
   * - Limits to 4000 characters - returns "Over 4k symbols" if exceeded
   * - Handles null/undefined values
   * - Converts objects and arrays to readable string representations
   *
   * @param value - The value to sanitize for Wrike custom fields
   * @returns A sanitized string value compliant with Wrike's API requirements
   */
  private sanitizeWrikeCustomFieldValue(value: any): string {
    if (value === null || value === undefined) {
      return "";
    }

    let stringValue: string;

    // Handle different data types
    if (Array.isArray(value)) {
      // Convert array to enumerated list format
      stringValue = this.formatArrayAsPlainText(value);
    } else if (typeof value === "object") {
      // Convert object to nested list format
      stringValue = this.formatObjectAsPlainText(value);
    } else {
      // Convert primitive values to string
      stringValue = String(value);
    }

    // Remove control characters (U+0000 through U+001F)
    stringValue = stringValue.replace(/[\u0000-\u001F]/g, "");

    // Check if value exceeds 4000 characters
    if (stringValue.length > 4000) {
      return "Over 4k symbols";
    }

    return stringValue;
  }

  /**
   * Formats an array as paragraphs for Wrike custom fields
   */
  private formatArrayAsPlainText(arr: any[]): string {
    if (arr.length === 0) {
      return "<p>No items</p>";
    }

    const paragraphs = arr
      .map((item, index) => {
        if (typeof item === "object" && item !== null) {
          return `<p><strong>Item ${
            index + 1
          }:</strong><br/>${this.formatObjectAsPlainText(item)}</p>`;
        } else {
          return `<p><strong>Item ${index + 1}:</strong> ${this.escapeHtml(
            String(item)
          )}</p>`;
        }
      })
      .join("");

    // Check if result exceeds 4000 characters
    if (paragraphs.length > 4000) {
      return "Over 4k symbols";
    }

    return paragraphs;
  }

  /**
   * Formats an object as paragraphs for Wrike custom fields
   */
  private formatObjectAsPlainText(obj: any): string {
    if (obj === null || obj === undefined) {
      return "<p>N/A</p>";
    }

    const entries = Object.entries(obj);
    if (entries.length === 0) {
      return "<p>No data</p>";
    }

    const paragraphs = entries
      .map(([key, value]) => {
        const formattedKey =
          key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, " $1");

        if (Array.isArray(value)) {
          return `<p><strong>${this.escapeHtml(
            formattedKey
          )}:</strong><br/>${this.formatArrayAsPlainText(value)}</p>`;
        } else if (typeof value === "object" && value !== null) {
          return `<p><strong>${this.escapeHtml(
            formattedKey
          )}:</strong><br/>${this.formatObjectAsPlainText(value)}</p>`;
        } else {
          return `<p><strong>${this.escapeHtml(
            formattedKey
          )}:</strong> ${this.escapeHtml(String(value))}</p>`;
        }
      })
      .join("");

    // Check if result exceeds 4000 characters
    if (paragraphs.length > 4000) {
      return "Over 4k symbols";
    }

    return paragraphs;
  }

  /**
   * Converts objects and arrays to simple plain text strings without HTML
   * Handles length limits for custom fields
   */
  private convertToPlainText(value: any): string {
    if (value === null || value === undefined) {
      return "";
    }

    let result: string;

    if (Array.isArray(value)) {
      result = value
        .map((item, index) => {
          if (typeof item === "object" && item !== null) {
            return `Item ${index + 1}: ${this.convertObjectToPlainText(item)}`;
          } else {
            return `Item ${index + 1}: ${String(item)}`;
          }
        })
        .join("\n");
    } else if (typeof value === "object") {
      result = this.convertObjectToPlainText(value);
    } else {
      result = String(value);
    }

    // Check if result exceeds 4000 characters
    if (result.length > 4000) {
      return "Over 4k symbols";
    }

    return result;
  }

  /**
   * Converts an object to plain text format
   */
  private convertObjectToPlainText(obj: any): string {
    if (obj === null || obj === undefined) {
      return "N/A";
    }

    const entries = Object.entries(obj);
    if (entries.length === 0) {
      return "No data";
    }

    return entries
      .map(([key, value]) => {
        const formattedKey =
          key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, " $1");

        if (Array.isArray(value)) {
          return `${formattedKey}: ${this.convertToPlainText(value)}`;
        } else if (typeof value === "object" && value !== null) {
          return `${formattedKey}: ${this.convertObjectToPlainText(value)}`;
        } else {
          return `${formattedKey}: ${String(value)}`;
        }
      })
      .join("\n");
  }

  /**
   * Escapes HTML special characters to prevent XSS and ensure proper display
   */
  private escapeHtml(text: string): string {
    if (!text) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * Creates HTML anchor tags for ShopVox work orders from sales orders array
   */
  private createWorkOrderLinks(salesOrders: any[]): string {
    if (!salesOrders || salesOrders.length === 0) {
      return "";
    }

    const links = salesOrders
      .filter((order) => order && order.id && order.txnNumber) // Filter out invalid orders
      .map((order) => {
        const url = `https://api.shopvox.com/edge//work_orders/${order.id}/pdf_document?pdf_type=WorkOrder`;
        const displayText = `SO #${order.txnNumber}`;
        return `<a href="${this.escapeHtml(
          url
        )}" target="_blank">${this.escapeHtml(displayText)}</a>`;
      })
      .join(", ");

    return links;
  }

  /**
   * Cleans HTML tags from text while preserving the content
   */
  private cleanHtmlTags(text: string): string {
    if (!text) return "";
    return String(text)
      .replace(/<[^>]*>/g, "") // Remove HTML tags
      .replace(/&nbsp;/g, " ") // Replace non-breaking spaces
      .replace(/&amp;/g, "&") // Decode HTML entities
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  /**
   * Formats addresses for a sales order and returns them as custom field data
   * @param salesOrder - The sales order to format addresses for
   * @returns Promise<Record<string, string>> - Custom field data with formatted addresses
   */
  private async formatSalesOrderAddresses(
    salesOrder: ShopVoxSalesOrder
  ): Promise<Record<string, string>> {
    try {
      // Format addresses for Wrike custom fields
      const shippingAddressText = formatAddress(
        salesOrder.shippingAddress as any
      );
      const billingAddressText = formatAddress(
        salesOrder.billingAddress as any
      );
      const installAddressText = await getInstallAddressFromQuote(
        salesOrder,
        shopvoxService
      );

      return {
        [WRIKE_ADDRESS_FIELD_IDS.SHIPPING_ADDRESS]: shippingAddressText,
        [WRIKE_ADDRESS_FIELD_IDS.BILLING_ADDRESS]: billingAddressText,
        [WRIKE_ADDRESS_FIELD_IDS.INSTALL_ADDRESS]: installAddressText,
      };
    } catch (error) {
      console.error("Error formatting sales order addresses:", error);
      // Return empty addresses if formatting fails
      return {
        [WRIKE_ADDRESS_FIELD_IDS.SHIPPING_ADDRESS]: "",
        [WRIKE_ADDRESS_FIELD_IDS.BILLING_ADDRESS]: "",
        [WRIKE_ADDRESS_FIELD_IDS.INSTALL_ADDRESS]: "",
      };
    }
  }

  /**
   * Maps a ShopVox quote to Wrike custom fields
   */
  private mapQuoteToCustomFields(quote: ShopVoxQuote) {
    const baseCustomFields = [
      {
        id: "IEADYYMRJUAJFPCR",
        value: this.sanitizeWrikeCustomFieldValue(quote.id),
      },
      {
        id: "IEADYYMRJUAJFPY4",
        value: this.sanitizeWrikeCustomFieldValue(quote.active),
      },
      {
        id: "IEADYYMRJUAJFPY5",
        value: this.sanitizeWrikeCustomFieldValue(quote.title),
      },
      {
        id: "IEADYYMRJUAJFPZB",
        value: this.sanitizeWrikeCustomFieldValue(quote.description),
      },
      {
        id: "IEADYYMRJUAJFPZC",
        value: this.sanitizeWrikeCustomFieldValue(quote.txnDate),
      },
      {
        id: "IEADYYMRJUAJFP3B",
        value: this.sanitizeWrikeCustomFieldValue(quote.txnNumber),
      },
      {
        id: "IEADYYMRJUAJFPZD",
        value: this.sanitizeWrikeCustomFieldValue(quote.totalPriceInDollars),
      },
      {
        id: "IEADYYMRJUAJFPZF",
        value: this.sanitizeWrikeCustomFieldValue(quote.totalTaxInDollars),
      },
      {
        id: "IEADYYMRJUAJFPZH",
        value: this.sanitizeWrikeCustomFieldValue(
          quote.totalPriceWithTaxInDollars
        ),
      },
      {
        id: "IEADYYMRJUAJFP2V",
        value: this.sanitizeWrikeCustomFieldValue(quote.workflowState),
      },
      {
        id: "IEADYYMRJUAJFP27",
        value: this.sanitizeWrikeCustomFieldValue(quote.expiryDate),
      },
      {
        id: "IEADYYMRJUAJFQR5",
        value: this.sanitizeWrikeCustomFieldValue(quote.nextContactDate),
      },
      {
        id: "IEADYYMRJUAJFQR6",
        value: this.sanitizeWrikeCustomFieldValue(quote.potentialClosingDate),
      },
      {
        id: "IEADYYMRJUAJFQR7",
        value: this.sanitizeWrikeCustomFieldValue(quote.closingPotential),
      },
      {
        id: "IEADYYMRJUAJFQSC",
        value: this.sanitizeWrikeCustomFieldValue(quote.customerPoNumber),
      },
      {
        id: "IEADYYMRJUAJFQSE",
        value: this.sanitizeWrikeCustomFieldValue(quote.customerPoDate),
      },
      {
        id: "IEADYYMRJUAJFQSF",
        value: this.sanitizeWrikeCustomFieldValue(quote.autoExpire),
      },
      {
        id: "IEADYYMRJUAJFQSH",
        value: this.sanitizeWrikeCustomFieldValue(quote.downpaymentPercent),
      },
      {
        id: "IEADYYMRJUAJFQSJ",
        value: this.sanitizeWrikeCustomFieldValue(quote.shippingTracking),
      },
      {
        id: "IEADYYMRJUAJFQSL",
        value: this.sanitizeWrikeCustomFieldValue(quote.shippingDate),
      },
      {
        id: "IEADYYMRJUAJFSVG",
        value: this.sanitizeWrikeCustomFieldValue(quote.createdAt),
      },
      {
        id: "IEADYYMRJUAJFSWB",
        value: this.sanitizeWrikeCustomFieldValue(quote.updatedAt),
      },
      {
        id: "IEADYYMRJUAJFSWE",
        value: this.sanitizeWrikeCustomFieldValue(quote.lastNote),
      },
      {
        id: "IEADYYMRJUAJFSWF",
        value: this.sanitizeWrikeCustomFieldValue(quote.age),
      },
      {
        id: "IEADYYMRJUAJFSWJ",
        value: this.sanitizeWrikeCustomFieldValue(quote.lastEmailedDate),
      },
      {
        id: "IEADYYMRJUAJFSWM",
        value: this.sanitizeWrikeCustomFieldValue(quote.quoteFor),
      },
      {
        id: "IEADYYMRJUAJFSWP",
        value: this.sanitizeWrikeCustomFieldValue(quote.customerNote),
      },
      {
        id: "IEADYYMRJUAJFSWW",
        value: this.sanitizeWrikeCustomFieldValue(quote.site),
      },
      {
        id: "IEADYYMRJUAJFSWX",
        value: this.sanitizeWrikeCustomFieldValue(quote.quickQuote),
      },
      {
        id: "IEADYYMRJUAJFSWY",
        value: this.sanitizeWrikeCustomFieldValue(quote.inHandDate),
      },
      {
        id: "IEADYYMRJUAJFSW5",
        value: this.convertToPlainText(quote.createdBy),
      },
      {
        id: "IEADYYMRJUAJFSXF",
        value: this.sanitizeWrikeCustomFieldValue(quote.salesOrders),
      },
      {
        id: "IEADYYMRJUAJFSXH",
        value: this.sanitizeWrikeCustomFieldValue(quote.primaryContact?.name),
      },
      {
        id: "IEADYYMRJUAJFSXI",
        value: this.sanitizeWrikeCustomFieldValue(
          quote.primaryContact?.primaryEmail
        ),
      },
      {
        id: "IEADYYMRJUAJFSXJ",
        value: this.sanitizeWrikeCustomFieldValue(
          quote.primaryContact?.phoneWithExt
        ),
      },
      {
        id: "IEADYYMRJUAJFSXK",
        value: this.sanitizeWrikeCustomFieldValue(quote.primaryContact?.id),
      },
      {
        id: "IEADYYMRJUAJFSXM",
        value: this.sanitizeWrikeCustomFieldValue(quote.primarySalesRep?.id),
      },
      {
        id: "IEADYYMRJUAJFSXO",
        value: this.sanitizeWrikeCustomFieldValue(
          quote.primarySalesRep?.initials
        ),
      },
      {
        id: "IEADYYMRJUAJFSXP",
        value: this.sanitizeWrikeCustomFieldValue(quote.company?.id),
      },
      {
        id: "IEADYYMRJUAJFSXR",
        value: this.sanitizeWrikeCustomFieldValue(quote.company?.name),
      },
      {
        id: "IEADYYMRJUAJFSXV",
        value: this.sanitizeWrikeCustomFieldValue(quote.company?.phoneWithExt),
      },
      {
        id: "IEADYYMRJUAJFSXW",
        value: this.sanitizeWrikeCustomFieldValue(quote.leadSourceId),
      },
      {
        id: "IEADYYMRJUAJFSX2",
        value: this.convertToPlainText(quote.lineItems),
      },
      {
        id: "IEADYYMRJUAJG7E4",
        value: `<a href="${this.escapeHtml(
          `https://express.shopvox.com/transactions/quotes/${quote.id}`
        )}" target="_blank">QT #${this.escapeHtml(quote.txnNumber)}</a>`,
      },
      {
        id: "IEADYYMRJUAJJ6HA",
        value: this.createWorkOrderLinks(quote.salesOrders),
      },
      {
        id: WRIKE_ADDRESS_FIELD_IDS.INSTALL_ADDRESS,
        value: this.sanitizeWrikeCustomFieldValue(
          formatAddress(quote.installingAddress as ShopVoxAddress)
        ),
      },
    ];

    // Add contact field mappings if the respective users exist in the quote
    const contactFields = [];

    // Project Manager (IEADYYMRJUAJIFD5)
    if (quote.projectManager?.id) {
      contactFields.push({
        id: "IEADYYMRJUAJIFD5",
        value: mapShopVoxToWrikeUserId(quote.projectManager.id),
      });
    }

    // Production Manager (IEADYYMRJUAJIFEE)
    if (quote.pm?.id) {
      contactFields.push({
        id: "IEADYYMRJUAJIFEE",
        value: mapShopVoxToWrikeUserId(quote.pm.id),
      });
    }

    // Estimator (IEADYYMRJUAJIFEM)
    if (quote.estimator?.id) {
      contactFields.push({
        id: "IEADYYMRJUAJIFEM",
        value: mapShopVoxToWrikeUserId(quote.estimator.id),
      });
    }

    // Sales Rep (IEADYYMRJUAJFSXL)
    if (quote.primarySalesRep?.id) {
      contactFields.push({
        id: "IEADYYMRJUAJFSXL",
        value: mapShopVoxToWrikeUserId(quote.primarySalesRep.id),
      });
    }

    // Created By (IEADYYMRJUAJIFEN) - always present
    contactFields.push({
      id: "IEADYYMRJUAJIFEN",
      value: mapShopVoxToWrikeUserId(quote.createdBy.id),
    });

    // Combine all custom fields
    return [...baseCustomFields, ...contactFields];
  }

  /**
   * Maps a ShopVox sales order to Wrike custom fields
   */
  private mapSalesOrderToCustomFields(
    salesOrder: ShopVoxSalesOrder,
    customFields?: Record<string, string>
  ) {
    const baseCustomFields = [
      {
        id: "IEADYYMRJUAJFPCR",
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.id),
      },
      {
        id: "IEADYYMRJUAJFPY4",
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.active),
      },
      {
        id: "IEADYYMRJUAJFPY5",
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.title),
      },
      {
        id: "IEADYYMRJUAJFPZB",
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.description),
      },
      {
        id: "IEADYYMRJUAJFPZC",
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.txnDate),
      },
      {
        id: "IEADYYMRJUAJFP3B",
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.txnNumber),
      },
      {
        id: "IEADYYMRJUAJFPZD",
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.totalPriceInDollars
        ),
      },
      {
        id: "IEADYYMRJUAJFPZF",
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.totalTaxInDollars),
      },
      {
        id: "IEADYYMRJUAJFPZH",
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.totalPriceWithTaxInDollars
        ),
      },
      {
        id: "IEADYYMRJUAJFP2V",
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.workflowState),
      },
      {
        id: "IEADYYMRJUAJFQSC",
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.customerPoNumber),
      },
      {
        id: "IEADYYMRJUAJFQSE",
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.customerPoDate),
      },
      {
        id: "IEADYYMRJUAJFQSH",
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.downpaymentPercent
        ),
      },
      {
        id: "IEADYYMRJUAJFQSL",
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.shippingDate),
      },
      {
        id: "IEADYYMRJUAJKGQJ",
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.inHandDate),
      },
      {
        id: "IEADYYMRJUAJKGSN",
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.dueDate),
      },
      {
        id: "IEADYYMRJUAJFSVG",
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.createdAt),
      },
      {
        id: "IEADYYMRJUAJFSWB",
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.updatedAt),
      },
      {
        id: "IEADYYMRJUAJFSW5",
        value: this.convertToPlainText(salesOrder.createdBy),
      },
      {
        id: "IEADYYMRJUAJFSXH",
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.primaryContact?.name
        ),
      },
      {
        id: "IEADYYMRJUAJFSXI",
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.primaryContact?.email
        ),
      },
      {
        id: "IEADYYMRJUAJFSXJ",
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.primaryContact?.phoneWithExt
        ),
      },
      {
        id: "IEADYYMRJUAJFSXK",
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.primaryContact?.id
        ),
      },
      {
        id: "IEADYYMRJUAJFSXM",
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.primarySalesRep?.id
        ),
      },
      {
        id: "IEADYYMRJUAJFSXO",
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.primarySalesRep?.initials
        ),
      },
      {
        id: "IEADYYMRJUAJFSXP",
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.company?.id),
      },
      {
        id: "IEADYYMRJUAJFSXR",
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.company?.name),
      },
      {
        id: "IEADYYMRJUAJFSXV",
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.company?.phoneWithExt
        ),
      },
      {
        id: "IEADYYMRJUAJFSX2",
        value: this.convertToPlainText(salesOrder.lineItems),
      },
      // Sales Order specific fields
      {
        id: "IEADYYMRJUAJFS26",
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.totalPaymentsInDollars
        ),
      },
      {
        id: "IEADYYMRJUAJFS27",
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.balanceInDollars),
      },
      {
        id: "IEADYYMRJUAJFS3A",
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.lastInvoicedAt),
      },
      {
        id: "IEADYYMRJUAJFS3F",
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.lastInvoicedOn),
      },
      {
        id: "IEADYYMRJUAJFS3G",
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.invoiced),
      },
      {
        id: "IEADYYMRJUAJFS3H",
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.fullyInvoiced),
      },
      {
        id: "IEADYYMRJUAJFS3J",
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.billingAddressId),
      },
      {
        id: "IEADYYMRJUAJFS3K",
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.shippingAddressId),
      },
      {
        id: "IEADYYMRJUAJFS3M",
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.termCodeId),
      },
      {
        id: "IEADYYMRJUAJFS3N",
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.salesTaxId),
      },
      {
        id: "IEADYYMRJUAJFS3Z",
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.shippingMethodId),
      },
      {
        id: "IEADYYMRJUAJFS37",
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.productionManagerId
        ),
      },
      {
        id: "IEADYYMRJUAJFS4A",
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.projectManagerId),
      },
      {
        id: "IEADYYMRJUAJFS4C",
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.setupChargesInDollars
        ),
      },
      {
        id: "IEADYYMRJUAJFS4M",
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.setupChargesTaxable
        ),
      },
      {
        id: "IEADYYMRJUAJFS4R",
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.setupChargesIsPercent
        ),
      },
      {
        id: "IEADYYMRJUAJFS4U",
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.setupChargesPercent
        ),
      },
      {
        id: "IEADYYMRJUAJFS4V",
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.setupChargesTaxInDollars
        ),
      },
      {
        id: "IEADYYMRJUAJFS5C",
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.miscChargesTaxable
        ),
      },
      {
        id: "IEADYYMRJUAJFS5G",
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.miscChargesLabel),
      },
      {
        id: "IEADYYMRJUAJFS5J",
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.miscChargesIsPercent
        ),
      },
      {
        id: "IEADYYMRJUAJFUCB",
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.miscChargesPercent
        ),
      },
      {
        id: "IEADYYMRJUAJFUCY",
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.financeChargesPercent
        ),
      },
      {
        id: "IEADYYMRJUAJFUC5",
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.company?.specialNotes
        ),
      },
      {
        id: "IEADYYMRJUAJFUDA",
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.termCode?.name),
      },
      {
        id: "IEADYYMRJUAJFUDE",
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.tax?.name),
      },
      {
        id: "IEADYYMRJUAJFUDW",
        value: this.convertToPlainText(salesOrder.updatedBy),
      },
      {
        id: "IEADYYMRJUAJFUDX",
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.relatedTransactions
        ),
      },
      {
        id: "IEADYYMRJUAJFUDZ",
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.orderPayments),
      },
      {
        id: "IEADYYMRJUAJFUD4",
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.purchaseOrderLineItemsTotalPriceInDollars
        ),
      },
      {
        id: "IEADYYMRJUAJFUD6",
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.purchaseOrders),
      },
      {
        id: "IEADYYMRJUAJFUED",
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.signatures),
      },
      {
        id: "IEADYYMRJUAJJEVR",
        value: `<a href="${this.escapeHtml(
          `https://express.shopvox.com/transactions/sales-orders/${salesOrder.id}`
        )}" target="_blank">SO #${this.escapeHtml(salesOrder.txnNumber)}</a>`,
      },
    ];

    // Add contact field mappings if the respective users exist in the sales order
    const contactFields = [];

    // Project Manager (IEADYYMRJUAJIFD5)
    if (salesOrder.projectManager?.id) {
      contactFields.push({
        id: "IEADYYMRJUAJIFD5",
        value: mapShopVoxToWrikeUserId(salesOrder.projectManager.id),
      });
    }

    // Production Manager (IEADYYMRJUAJIFEE)
    if ((salesOrder as any).productionManager?.id) {
      contactFields.push({
        id: "IEADYYMRJUAJIFEE",
        value: mapShopVoxToWrikeUserId(
          (salesOrder as any).productionManager.id
        ),
      });
    }

    // Sales Rep (IEADYYMRJUAJFSXL)
    if (salesOrder.primarySalesRep?.id) {
      contactFields.push({
        id: "IEADYYMRJUAJFSXL",
        value: mapShopVoxToWrikeUserId(salesOrder.primarySalesRep.id),
      });
    }

    // Created By (IEADYYMRJUAJIFEN) - always present
    contactFields.push({
      id: "IEADYYMRJUAJIFEN",
      value: mapShopVoxToWrikeUserId(salesOrder.createdBy.id),
    });

    // Add address fields if provided
    const addressFields: any[] = [];
    if (customFields) {
      // Shipping Address (IEADYYMRJUAJJ7RA)
      if (customFields["IEADYYMRJUAJJ7RA"]) {
        addressFields.push({
          id: "IEADYYMRJUAJJ7RA",
          value: this.sanitizeWrikeCustomFieldValue(
            customFields["IEADYYMRJUAJJ7RA"]
          ),
        });
      }

      // Billing Address (IEADYYMRJUAJJ7RD)
      if (customFields["IEADYYMRJUAJJ7RD"]) {
        addressFields.push({
          id: "IEADYYMRJUAJJ7RD",
          value: this.sanitizeWrikeCustomFieldValue(
            customFields["IEADYYMRJUAJJ7RD"]
          ),
        });
      }

      // Install Address (IEADYYMRJUAJIG5N)
      if (customFields["IEADYYMRJUAJIG5N"]) {
        addressFields.push({
          id: "IEADYYMRJUAJIG5N",
          value: this.sanitizeWrikeCustomFieldValue(
            customFields["IEADYYMRJUAJIG5N"]
          ),
        });
      }
    }

    // Combine all custom fields
    return [...baseCustomFields, ...contactFields, ...addressFields];
  }

  /**
   * Creates a new task in Wrike from a ShopVox quote
   * @param quote - The ShopVox quote to create a task for
   * @param useNewStatus - If true, uses "New" status instead of mapping the workflow state
   */
  async createQuoteTask(quote: ShopVoxQuote): Promise<WrikeTaskCreateResponse> {
    // Validate required fields
    if (!quote.title || quote.title.trim() === "") {
      throw new Error("Quote title is required but was empty or undefined");
    }

    let description: string;
    try {
      description = this.createWrikeQuoteTaskDescription(quote);
      // Wrike has a limit on description length, truncate if necessary
      if (description.length > 5000) {
        console.warn(
          `Description too long (${description.length} chars), truncating to 5000 chars`
        );
        description = description.substring(0, 5000) + "...";
      }
    } catch (error) {
      console.error("Error creating task description:", error);
      description = `<h2>📋 Quote Information</h2><p><strong>Quote ID:</strong> ${this.escapeHtml(
        quote.id
      )}</p><p><strong>Title:</strong> ${this.escapeHtml(quote.title)}</p>`;
    }

    const responsibles = [mapShopVoxToWrikeUserId(quote.createdBy.id)];
    // const parents = [
    //   mapShopVoxUserIdToWrikeFolderMapping(quote.createdBy.id)?.wrikeFolderId
    //     .forQuotes,
    // ];

    if (quote.primarySalesRep?.id) {
      responsibles.push(mapShopVoxToWrikeUserId(quote.primarySalesRep.id));
      // parents.push(
      //   mapShopVoxUserIdToWrikeFolderMapping(quote.primarySalesRep.id)
      //     ?.wrikeFolderId.forQuotes
      // );
    }

    const requestBody: any = {
      title: `QT #${quote.txnNumber}: ${quote.title}`,
      description: description,
      responsibles,
      //parents,
      customFields: this.mapQuoteToCustomFields(quote),
      customStatus: mapShopVoxToWrikeStatusId(quote.workflowState),
      customItemTypeId: "IEADYYMRPIAFJ6UP", // Quote Custom Item Type ID
    };

    // Validate request body before sending
    try {
      JSON.stringify(requestBody);
    } catch (error) {
      console.error("Request body is not serializable:", error);
      throw new Error(
        `Request body serialization failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }

    const response = await this.makeRequest(
      `${this.baseUrl}/folders/${this.quotesDbId}/tasks`,
      {
        method: "POST",
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      let errorDetails = "";
      try {
        const errorResponse = await response.json();
        errorDetails = JSON.stringify(errorResponse, null, 2);
      } catch (e) {
        errorDetails = await response.text();
      }

      const errorMessage = `Failed to create Wrike task: ${response.status} ${
        response.statusText
      }\nQuote ID: ${quote.id}\nQuote Title: "${
        quote.title
      }"\nDescription length: ${
        requestBody.description?.length || 0
      }\nRequest body: ${JSON.stringify(
        requestBody,
        null,
        2
      )}\nError response: ${errorDetails}`;
      console.error("Wrike API Error:", errorMessage);
      throw new Error(errorMessage);
    }

    return await response.json();
  }

  /**
   * Searches for a task by ShopVox quote ID
   */
  async findTaskByQuoteId(quoteId: string): Promise<WrikeTaskSearchResult> {
    const params = new URLSearchParams({
      customFields: JSON.stringify([
        {
          id: "IEADYYMRJUAJFPCR", // shopvoxId
          comparator: "EqualTo",
          value: quoteId,
        },
      ]),
    });

    const response = await this.makeRequest(
      `${this.baseUrl}/folders/${this.quotesDbId}/tasks?${params.toString()}`,
      {
        method: "GET",
      }
    );

    if (!response.ok) {
      let errorDetails = "";
      try {
        const errorResponse = await response.json();
        errorDetails = JSON.stringify(errorResponse, null, 2);
      } catch (e) {
        errorDetails = await response.text();
      }

      throw new Error(
        `Failed to search Wrike tasks: ${response.status} ${
          response.statusText
        }\nSearch params: ${params.toString()}\nError response: ${errorDetails}`
      );
    }

    return await response.json();
  }

  /**
   * Updates an existing task in Wrike from a ShopVox quote
   */
  async updateQuoteTask(
    taskId: string,
    quote: ShopVoxQuote,
    oldResponsibles?: string[],
    newResponsibles?: string[]
  ): Promise<WrikeTaskUpdateResponse> {
    let description: string;
    try {
      description = this.createWrikeQuoteTaskDescription(quote);
      // Wrike has a limit on description length, truncate if necessary
      if (description.length > 5000) {
        console.warn(
          `Description too long (${description.length} chars), truncating to 5000 chars`
        );
        description = description.substring(0, 5000) + "...";
      }
    } catch (error) {
      console.error("Error creating task description:", error);
      description = `<h2>📋 Quote Information</h2><p><strong>Quote ID:</strong> ${this.escapeHtml(
        quote.id
      )}</p><p><strong>Title:</strong> ${this.escapeHtml(quote.title)}</p>`;
    }

    const responsibles = [mapShopVoxToWrikeUserId(quote.createdBy.id)];
    if (quote.primarySalesRep?.id) {
      responsibles.push(mapShopVoxToWrikeUserId(quote.primarySalesRep.id));
    }

    const requestBody: any = {
      title: `QT #${quote.txnNumber}: ${quote.title}`,
      description: description,
      addResponsibles: responsibles,
      customFields: this.mapQuoteToCustomFields(quote),
      customStatus: mapShopVoxToWrikeStatusId(quote.workflowState),
    };

    if (oldResponsibles) {
      requestBody.removeResponsibles = oldResponsibles.map((r) => {
        return mapShopVoxToWrikeUserId(r);
      });
    }

    if (newResponsibles) {
      requestBody.addResponsibles = newResponsibles.map((r) => {
        return mapShopVoxToWrikeUserId(r);
      });
    }

    const response = await this.makeRequest(`${this.baseUrl}/tasks/${taskId}`, {
      method: "PUT",
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      let errorDetails = "";
      try {
        const errorResponse = await response.json();
        errorDetails = JSON.stringify(errorResponse, null, 2);
      } catch (e) {
        errorDetails = await response.text();
      }

      const errorMessage = `Failed to update Wrike task: ${response.status} ${
        response.statusText
      }\nTask ID: ${taskId}\nDescription length: ${
        requestBody.description?.length || 0
      }\nRequest body: ${JSON.stringify(
        requestBody,
        null,
        2
      )}\nError response: ${errorDetails}`;
      console.error("Wrike API Error:", errorMessage);
      throw new Error(errorMessage);
    }

    return await response.json();
  }

  /**
   * Creates or updates a quote task in Wrike
   * Returns the task ID and whether it was created or updated
   * @param quote - The ShopVox quote to create or update a task for
   * @param useNewStatus - If true, uses "New" status instead of mapping the workflow state for new tasks
   */
  async createOrUpdateQuoteTask(
    quote: ShopVoxQuote,
    oldResponsibles?: string[],
    newResponsibles?: string[]
  ): Promise<{ taskId: string; wasCreated: boolean }> {
    try {
      const searchResult = await this.findTaskByQuoteId(quote.id);

      if (searchResult.data.length > 0) {
        // Task exists, update it
        const taskId = searchResult.data[0].id;
        await this.updateQuoteTask(
          taskId,
          quote,
          oldResponsibles,
          newResponsibles
        );
        return { taskId, wasCreated: false };
      } else {
        const createResult = await this.createQuoteTask(quote);
        const taskId = createResult.data[0].id;
        return { taskId, wasCreated: true };
      }
    } catch (error) {
      console.error(
        `Error in createOrUpdateQuoteTask for quote ${quote.id}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Creates a new WoSo task in Wrike from a ShopVox sales order
   */
  async createWosoTask(
    salesOrder: ShopVoxSalesOrder,
    customFields?: Record<string, string>
  ): Promise<WrikeTaskCreateResponse> {
    // Validate required fields
    if (!salesOrder.title || salesOrder.title.trim() === "") {
      throw new Error(
        "Sales order title is required but was empty or undefined"
      );
    }

    let description: string;
    try {
      description = this.createWosoTaskDescription(salesOrder);
      // Wrike has a limit on description length, truncate if necessary
      if (description.length > 5000) {
        console.warn(
          `Description too long (${description.length} chars), truncating to 5000 chars`
        );
        description = description.substring(0, 5000) + "...";
      }
    } catch (error) {
      console.error("Error creating task description:", error);
      description = `<h2>📋 Sales Order Information</h2><p><strong>Sales Order ID:</strong> ${this.escapeHtml(
        salesOrder.id
      )}</p><p><strong>Title:</strong> ${this.escapeHtml(
        salesOrder.title
      )}</p>`;
    }

    const responsibles = [mapShopVoxToWrikeUserId(salesOrder.createdBy.id)];
    if (salesOrder.projectManager?.id) {
      responsibles.push(mapShopVoxToWrikeUserId(salesOrder.projectManager.id));
    }

    const requestBody: any = {
      title: `SO #${salesOrder.txnNumber}: ${salesOrder.title}`,
      description: description,
      responsibles,
      customFields: this.mapSalesOrderToCustomFields(salesOrder, customFields),
      customItemTypeId: "IEADYYMRPIAFKUFH", // Sales Order Custom Item Type ID
    };

    // Validate request body before sending
    try {
      JSON.stringify(requestBody);
    } catch (error) {
      console.error("Request body is not serializable:", error);
      throw new Error(
        `Request body serialization failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }

    const response = await this.makeRequest(
      `${this.baseUrl}/folders/${this.wososDbId}/tasks`,
      {
        method: "POST",
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      let errorDetails = "";
      try {
        const errorResponse = await response.json();
        errorDetails = JSON.stringify(errorResponse, null, 2);
      } catch (e) {
        errorDetails = await response.text();
      }

      const errorMessage = `Failed to create Wrike WoSo task: ${
        response.status
      } ${response.statusText}\nSales Order ID: ${
        salesOrder.id
      }\nSales Order Title: "${salesOrder.title}"\nDescription length: ${
        requestBody.description?.length || 0
      }\nRequest body: ${JSON.stringify(
        requestBody,
        null,
        2
      )}\nError response: ${errorDetails}`;
      console.error("Wrike API Error:", errorMessage);
      throw new Error(errorMessage);
    }

    return await response.json();
  }

  /**
   * Searches for a WoSo task by ShopVox sales order ID
   */
  async findTaskBySalesOrderId(
    salesOrderId: string
  ): Promise<WrikeTaskSearchResult> {
    const params = new URLSearchParams({
      customFields: JSON.stringify([
        {
          id: "IEADYYMRJUAJFPCR", // shopvoxId
          comparator: "EqualTo",
          value: salesOrderId,
        },
      ]),
    });

    const response = await this.makeRequest(
      `${this.baseUrl}/folders/${this.wososDbId}/tasks?${params.toString()}`,
      {
        method: "GET",
      }
    );

    if (!response.ok) {
      let errorDetails = "";
      try {
        const errorResponse = await response.json();
        errorDetails = JSON.stringify(errorResponse, null, 2);
      } catch (e) {
        errorDetails = await response.text();
      }

      throw new Error(
        `Failed to search Wrike WoSo tasks: ${response.status} ${
          response.statusText
        }\nSearch params: ${params.toString()}\nError response: ${errorDetails}`
      );
    }

    return await response.json();
  }

  /**
   * Updates an existing WoSo task in Wrike from a ShopVox sales order
   */
  async updateWosoTask(
    taskId: string,
    salesOrder: ShopVoxSalesOrder,
    customFields?: Record<string, string>,
    oldResponsibles?: string[],
    newResponsibles?: string[]
  ): Promise<WrikeTaskUpdateResponse> {
    let description: string;
    try {
      description = this.createWosoTaskDescription(salesOrder);
      // Wrike has a limit on description length, truncate if necessary
      if (description.length > 5000) {
        console.warn(
          `Description too long (${description.length} chars), truncating to 5000 chars`
        );
        description = description.substring(0, 5000) + "...";
      }
    } catch (error) {
      console.error("Error creating task description:", error);
      description = `<h2>📋 Sales Order Information</h2><p><strong>Sales Order ID:</strong> ${this.escapeHtml(
        salesOrder.id
      )}</p><p><strong>Title:</strong> ${this.escapeHtml(
        salesOrder.title
      )}</p>`;
    }

    const requestBody: any = {
      title: `SO #${salesOrder.txnNumber}: ${salesOrder.title}`,
      description: description,
      customFields: this.mapSalesOrderToCustomFields(salesOrder, customFields),
    };

    if (oldResponsibles) {
      requestBody.removeResponsibles = oldResponsibles.map((r) => {
        return mapShopVoxToWrikeUserId(r);
      });
    }

    if (newResponsibles) {
      requestBody.addResponsibles = newResponsibles.map((r) => {
        return mapShopVoxToWrikeUserId(r);
      });
    }

    const response = await this.makeRequest(`${this.baseUrl}/tasks/${taskId}`, {
      method: "PUT",
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      let errorDetails = "";
      try {
        const errorResponse = await response.json();
        errorDetails = JSON.stringify(errorResponse, null, 2);
      } catch (e) {
        errorDetails = await response.text();
      }

      const errorMessage = `Failed to update Wrike WoSo task: ${
        response.status
      } ${response.statusText}\nTask ID: ${taskId}\nDescription length: ${
        requestBody.description?.length || 0
      }\nRequest body: ${JSON.stringify(
        requestBody,
        null,
        2
      )}\nError response: ${errorDetails}`;
      console.error("Wrike API Error:", errorMessage);
      throw new Error(errorMessage);
    }

    return await response.json();
  }

  /**
   * Creates or updates a WoSo task in Wrike
   * Returns the task ID and whether it was created or updated
   * Automatically formats addresses for the sales order
   */
  async createOrUpdateWosoTask(
    salesOrder: ShopVoxSalesOrder,
    customFields?: Record<string, string>,
    oldResponsibles?: string[],
    newResponsibles?: string[]
  ): Promise<{
    taskId: string;
    wasCreated: boolean;
    customFields: Record<string, string>;
  }> {
    try {
      // Format addresses for the sales order
      const addressFields = await this.formatSalesOrderAddresses(salesOrder);

      // Merge any provided custom fields with the formatted addresses
      const mergedCustomFields = {
        ...addressFields,
        ...(customFields || {}),
      };

      const searchResult = await this.findTaskBySalesOrderId(salesOrder.id);

      if (searchResult.data.length > 0) {
        // Task exists, update it
        const taskId = searchResult.data[0].id;
        await this.updateWosoTask(
          taskId,
          salesOrder,
          mergedCustomFields,
          oldResponsibles,
          newResponsibles
        );
        return { taskId, wasCreated: false, customFields: mergedCustomFields };
      } else {
        // Task doesn't exist, create it
        const createResult = await this.createWosoTask(
          salesOrder,
          mergedCustomFields
        );
        const taskId = createResult.data[0].id;
        return { taskId, wasCreated: true, customFields: mergedCustomFields };
      }
    } catch (error) {
      console.error(
        `Error in createOrUpdateWosoTask for sales order ${salesOrder.id}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Creates a simple HTML description for a ShopVox quote task in Wrike focusing on line items
   */
  createWrikeQuoteTaskDescription(quote: ShopVoxQuote): string {
    try {
      return this.createQuoteLineItemsTable(quote);
    } catch (error) {
      console.error("Error creating quote task description:", error);
      // Fallback to a simple description if there's an error
      return `<h2>📋 Quote Information</h2><p><strong>Quote ID:</strong> ${this.escapeHtml(
        quote.id
      )}</p><p><strong>Title:</strong> ${this.escapeHtml(quote.title)}</p>`;
    }
  }

  /**
   * Creates a simple HTML description for a ShopVox sales order task in Wrike focusing on line items
   */
  createWosoTaskDescription(salesOrder: ShopVoxSalesOrder): string {
    try {
      return this.createSalesOrderLineItemsTable(salesOrder);
    } catch (error) {
      console.error("Error creating sales order task description:", error);
      // Fallback to a simple description if there's an error
      return `<h2>📋 Sales Order Information</h2><p><strong>Sales Order ID:</strong> ${this.escapeHtml(
        salesOrder.id
      )}</p><p><strong>Title:</strong> ${this.escapeHtml(
        salesOrder.title
      )}</p>`;
    }
  }

  /**
   * Creates an HTML table for quote line items
   *
   * TODO: Figure out why the table is not displaying correctly in Wrike. Not all rows are being displayed. Weirdly around the 6th or 7th row
   */
  private createQuoteLineItemsTable(quote: ShopVoxQuote): string {
    if (!quote.lineItems || quote.lineItems.length === 0) {
      return "<h2>📦 Line Items</h2><p>No line items</p>";
    }

    try {
      const tableRows = quote.lineItems
        .map((item, index) => {
          const description = item?.fullDescription
            ? this.cleanHtmlTags(item.fullDescription)
            : "";
          const displayDescription = description || "No description";

          return `
            <tr>
                <td style="font-weight: bold;">${this.escapeHtml(
                  item?.name || "Unnamed Item"
                )}</td>
                <td style="max-width: 200px; word-wrap: break-word;">${this.escapeHtml(
                  displayDescription
                )}</td>
                <td style="text-align: center;">${item?.quantity || 0}</td>
            </tr>`;
        })
        .join("");

      return `
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 12px; margin: 10px 0;">
            <tr style="background-color: #e6f3ff; font-weight: bold;">
                <td style="padding: 8px; border: 1px solid #ccc; width: 120px; font-weight: bold;">Name</td>
                <td style="padding: 8px; border: 1px solid #ccc; width: 200px; font-weight: bold;">Description</td>
                <td style="padding: 8px; border: 1px solid #ccc; text-align: center; width: 60px; font-weight: bold;">Quantity</td>
            </tr>
            ${tableRows}
        </table>`;
    } catch (error) {
      console.error("Error processing line items table:", error);
      return "<h2>📦 Line Items</h2><p>Error processing line items</p>";
    }
  }

  /**
   * Creates an HTML table for sales order line items
   */
  private createSalesOrderLineItemsTable(
    salesOrder: ShopVoxSalesOrder
  ): string {
    if (!salesOrder.lineItems || salesOrder.lineItems.length === 0) {
      return "<h2>�� Line Items</h2><p>No line items</p>";
    }

    try {
      const tableRows = salesOrder.lineItems
        .map((item, index) => {
          const description = item?.fullDescription
            ? this.cleanHtmlTags(item.fullDescription)
            : "";
          const displayDescription = description || "No description";

          return `
            <tr>
                <td style="font-weight: bold;">${this.escapeHtml(
                  item?.name || "Unnamed Item"
                )}</td>
                <td style="max-width: 200px; word-wrap: break-word;">${this.escapeHtml(
                  displayDescription
                )}</td>
                <td style="text-align: center;">${item?.quantity || 0}</td>
            </tr>`;
        })
        .join("");

      return `
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 12px; margin: 10px 0;">
            <tr style="background-color: #e6f3ff; font-weight: bold;">
                <td style="padding: 8px; border: 1px solid #ccc; width: 120px; font-weight: bold;">Name</td>
                <td style="padding: 8px; border: 1px solid #ccc; width: 200px; font-weight: bold;">Description</td>
                <td style="padding: 8px; border: 1px solid #ccc; text-align: center; width: 60px; font-weight: bold;">Quantity</td>
            </tr>
            ${tableRows}
        </table>`;
    } catch (error) {
      console.error("Error processing sales order line items table:", error);
      return "<h2>📦 Line Items</h2><p>Error processing line items</p>";
    }
  }
}

// Export a singleton instance
export const wrikeService = new WrikeService();
