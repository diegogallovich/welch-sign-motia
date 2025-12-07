import { ShopVoxQuote } from "../schemas/quote.schema";
import { ShopVoxSalesOrder } from "../schemas/sales-order.schema";
import { mapShopVoxToWrikeUserId } from "../utils/user-mapping";
import { mapShopVoxToWrikeStatusId } from "../utils/status-mapping";
import {
  formatAddress,
  getInstallAddressFromQuote,
  ShopVoxAddress,
} from "../utils/address-formatter";
import { shopvoxService } from "./shopvox.service";
import { mapShopVoxUserIdToWrikeFolderMapping } from "../utils/wrike-folder-mapping";
import {
  WRIKE_CUSTOM_FIELDS,
  WRIKE_ITEM_TYPES,
} from "../constants/wrike-fields";
import crypto from "crypto";

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

export interface WrikeWebhookVerificationResult {
  isVerification: boolean;
  isValid: boolean;
  calculatedSecret?: string;
  error?: string;
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
   * Gets the Wrike webhook secret from environment variables
   */
  private getWrikeWebhookSecret(): string {
    const secret = process.env.WRIKE_WEBHOOK_SECRET;
    if (!secret) {
      throw new Error("Missing WRIKE_WEBHOOK_SECRET in environment");
    }
    return secret;
  }

  /**
   * Calculates HMAC-SHA256 signature
   */
  private hmacSha256(key: string, value: string): string {
    return crypto.createHmac("sha256", key).update(value).digest("hex");
  }

  /**
   * Verifies a Wrike webhook request
   * @param req - The request object from the webhook handler
   * @returns Verification result with status and any calculated values
   */
  verifyWebhookRequest(req: any): WrikeWebhookVerificationResult {
    const wrikeSecret = this.getWrikeWebhookSecret();
    const wrikeHookSecretHeader = req.headers["x-hook-secret"];

    // 1. Handle Wrike's webhook secret verification request
    if (
      req.body &&
      typeof req.body === "object" &&
      req.body.requestType === "WebHook secret verification" &&
      typeof wrikeHookSecretHeader === "string"
    ) {
      // Calculate the response value
      const calculated = this.hmacSha256(wrikeSecret, wrikeHookSecretHeader);
      return {
        isVerification: true,
        isValid: true,
        calculatedSecret: calculated,
      };
    }

    // 2. For all other webhook calls, verify the authenticity of the payload
    if (typeof wrikeHookSecretHeader === "string") {
      // Wrike sends webhooks with pretty-printed JSON (2 spaces), so we need to match that format
      let bodyForSignature: string;

      if (typeof req.rawBody === "string") {
        // If we have raw body, use it directly
        bodyForSignature = req.rawBody;
      } else if (Buffer.isBuffer(req.rawBody)) {
        bodyForSignature = req.rawBody.toString();
      } else {
        // Fallback: Recreate the body in the same format Wrike uses (pretty-printed with 2 spaces)
        bodyForSignature = JSON.stringify(req.body, null, 2);
      }

      const expectedSig = this.hmacSha256(wrikeSecret, bodyForSignature);

      if (expectedSig !== wrikeHookSecretHeader) {
        return {
          isVerification: false,
          isValid: false,
          error: `Invalid webhook signature. Expected: ${expectedSig}, Received: ${wrikeHookSecretHeader}, Body length: ${bodyForSignature.length}`,
        };
      }
      return {
        isVerification: false,
        isValid: true,
      };
    } else {
      return {
        isVerification: false,
        isValid: false,
        error: "Missing webhook signature",
      };
    }
  }

  /**
   * Makes an HTTP request with timeout and retry logic
   */
  private async makeRequest(
    url: string,
    options: RequestInit = {},
    retryCount: number = 0,
    operation?: string,
    traceId?: string,
    stepName?: string
  ): Promise<Response> {
    const apiCallStartTime = Date.now();
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
        await new Promise((resolve) =>
          setTimeout(resolve, this.retryDelay * (retryCount + 1))
        );
        return this.makeRequest(
          url,
          options,
          retryCount + 1,
          operation,
          traceId,
          stepName
        );
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
   * Determines the fulfillment method based on line item names
   * @param lineItems - Array of line items from quote or sales order
   * @returns "Shipping" | "Install" | "Customer pickup" | "Conflict"
   */
  private determineFulfillmentMethod(lineItems: any[]): string {
    if (!lineItems || lineItems.length === 0) {
      return "";
    }

    let hasShipping = false;
    let hasInstall = false;

    for (const item of lineItems) {
      const name = (item?.name || "").toLowerCase();

      if (name.includes("shipping")) {
        hasShipping = true;
      }

      if (name.includes("install") || name.includes("installation")) {
        hasInstall = true;
      }

      // Early exit if both found
      if (hasShipping && hasInstall) {
        return "Conflict";
      }
    }

    if (hasShipping) return "Shipping";
    if (hasInstall) return "Install";
    return "Customer pickup";
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
   * Creates a Wrike task link URL
   * @param taskId - The Wrike task ID
   * @returns The full URL to open the task in Wrike
   */
  private createWrikeTaskLink(taskId: string): string {
    return `https://www.wrike.com/open.htm?id=${taskId}`;
  }

  /**
   * Finds Wrike tasks for related quotes and creates HTML links
   * @param relatedTransactions - Array of related transactions from a sales order
   * @returns HTML string with links to related quote tasks
   */
  private async findAndLinkQuoteTasks(
    relatedTransactions: any[]
  ): Promise<string> {
    if (!relatedTransactions || relatedTransactions.length === 0) {
      return "";
    }

    // Filter for Quote transactions only
    const quoteTransactions = relatedTransactions.filter(
      (txn) => txn.txnType === "Quote"
    );

    if (quoteTransactions.length === 0) {
      return "";
    }

    const links: string[] = [];

    for (const quoteTxn of quoteTransactions) {
      try {
        // Find the Wrike task by quote ID
        const searchResult = await this.findTaskByQuoteId(quoteTxn.txnId);

        if (searchResult.data && searchResult.data.length > 0) {
          const task = searchResult.data[0];
          const permalink = task.permalink;
          const title = task.title || `QT #${quoteTxn.txnNumber || "N/A"}`;

          if (permalink) {
            const link = `<a href="${this.escapeHtml(
              permalink
            )}" target="_blank">${this.escapeHtml(title)}</a>`;
            links.push(link);
          }
        }
      } catch (error) {
        // If task not found, skip it silently
        console.warn(
          `Could not find Wrike task for quote ${quoteTxn.txnId}:`,
          error
        );
      }
    }

    return links.join("<br />");
  }

  /**
   * Finds Wrike tasks for related sales orders and creates HTML links
   * @param salesOrders - Array of sales order IDs or objects from a quote
   * @returns HTML string with links to related sales order tasks
   */
  private async findAndLinkSalesOrderTasks(
    salesOrders: any[]
  ): Promise<string> {
    if (!salesOrders || salesOrders.length === 0) {
      return "";
    }

    const links: string[] = [];

    for (const salesOrder of salesOrders) {
      try {
        // Extract ID - handle both string IDs and objects with id property
        const salesOrderId =
          typeof salesOrder === "string" ? salesOrder : salesOrder.id;

        if (!salesOrderId) {
          console.warn("Sales order missing ID:", salesOrder);
          continue;
        }

        // Get txnNumber from the object if available, otherwise we'll get it from Wrike
        const txnNumberFromOrder =
          typeof salesOrder === "object" ? salesOrder.txnNumber : null;

        // Find the Wrike task by sales order ID
        const searchResult = await this.findTaskBySalesOrderId(salesOrderId);

        if (searchResult.data && searchResult.data.length > 0) {
          const task = searchResult.data[0];
          const permalink = task.permalink;
          const title = task.title || `SO #${txnNumberFromOrder || "N/A"}`;

          if (permalink) {
            const link = `<a href="${this.escapeHtml(
              permalink
            )}" target="_blank">${this.escapeHtml(title)}</a>`;
            links.push(link);
          }
        }
      } catch (error) {
        // If task not found, skip it silently
        const salesOrderId =
          typeof salesOrder === "string"
            ? salesOrder
            : salesOrder?.id || "unknown";
        console.warn(
          `Could not find Wrike task for sales order ${salesOrderId}:`,
          error
        );
      }
    }

    return links.join("<br />");
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
        [WRIKE_CUSTOM_FIELDS.SHIPPING_ADDRESS]: shippingAddressText,
        [WRIKE_CUSTOM_FIELDS.BILLING_ADDRESS]: billingAddressText,
        [WRIKE_CUSTOM_FIELDS.INSTALL_ADDRESS]: installAddressText,
      };
    } catch (error) {
      // Return empty addresses if formatting fails
      return {
        [WRIKE_CUSTOM_FIELDS.SHIPPING_ADDRESS]: "",
        [WRIKE_CUSTOM_FIELDS.BILLING_ADDRESS]: "",
        [WRIKE_CUSTOM_FIELDS.INSTALL_ADDRESS]: "",
      };
    }
  }

  /**
   * Maps a ShopVox quote to Wrike custom fields
   */
  private async mapQuoteToCustomFields(quote: ShopVoxQuote) {
    const baseCustomFields = [
      {
        id: WRIKE_CUSTOM_FIELDS.SHOPVOX_ID,
        value: this.sanitizeWrikeCustomFieldValue(quote.id),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.ACTIVE,
        value: this.sanitizeWrikeCustomFieldValue(quote.active),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.TITLE,
        value: this.sanitizeWrikeCustomFieldValue(quote.title),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.DESCRIPTION,
        value: this.sanitizeWrikeCustomFieldValue(quote.description),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.SO_CREATED_DATE,
        value: this.sanitizeWrikeCustomFieldValue(quote.txnDate),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.TXN_NUMBER,
        value: this.sanitizeWrikeCustomFieldValue(quote.txnNumber),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.SO_SUBTOTAL,
        value: this.sanitizeWrikeCustomFieldValue(quote.totalPriceInDollars),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.TAX,
        value: this.sanitizeWrikeCustomFieldValue(quote.totalTaxInDollars),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.TOTAL_PRICE_WITH_TAX,
        value: this.sanitizeWrikeCustomFieldValue(
          quote.totalPriceWithTaxInDollars
        ),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.SV_STATUS,
        value: this.sanitizeWrikeCustomFieldValue(quote.workflowState),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.EXPIRY_DATE,
        value: this.sanitizeWrikeCustomFieldValue(quote.expiryDate),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.NEXT_CONTENT_DATE,
        value: this.sanitizeWrikeCustomFieldValue(quote.nextContactDate),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.POTENTIAL_CLOSING_DATE,
        value: this.sanitizeWrikeCustomFieldValue(quote.potentialClosingDate),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.CLOSING_POTENTIAL,
        value: this.sanitizeWrikeCustomFieldValue(quote.closingPotential),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.CUSTOMER_PO_NUMBER,
        value: this.sanitizeWrikeCustomFieldValue(quote.customerPoNumber),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.CUSTOMER_PO_DATE,
        value: this.sanitizeWrikeCustomFieldValue(quote.customerPoDate),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.AUTO_EXPIRE,
        value: this.sanitizeWrikeCustomFieldValue(quote.autoExpire),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.DOWNPAYMENT_PERCENT,
        value: this.sanitizeWrikeCustomFieldValue(quote.downpaymentPercent),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.SHIPPING_TRACKING,
        value: this.sanitizeWrikeCustomFieldValue(quote.shippingTracking),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.SHIPPED_DATE,
        value: this.sanitizeWrikeCustomFieldValue(quote.shippingDate),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.CREATED_AT,
        value: this.sanitizeWrikeCustomFieldValue(quote.createdAt),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.UPDATED_AT,
        value: this.sanitizeWrikeCustomFieldValue(quote.updatedAt),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.LAST_NOTE,
        value: this.sanitizeWrikeCustomFieldValue(quote.lastNote),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.AGE,
        value: this.sanitizeWrikeCustomFieldValue(quote.age),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.LAST_EMAILED_DATE,
        value: this.sanitizeWrikeCustomFieldValue(quote.lastEmailedDate),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.QUOTE_FOR,
        value: this.sanitizeWrikeCustomFieldValue(quote.quoteFor),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.CUSTOMER_NOTE,
        value: this.sanitizeWrikeCustomFieldValue(quote.customerNote),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.SITE,
        value: this.sanitizeWrikeCustomFieldValue(quote.site),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.QUICK_QUOTE,
        value: this.sanitizeWrikeCustomFieldValue(quote.quickQuote),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.IN_HAND_DATE,
        value: this.sanitizeWrikeCustomFieldValue(quote.inHandDate),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.CREATED_BY_ID,
        value: this.convertToPlainText(quote.createdBy),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.SALES_ORDERS,
        value: this.sanitizeWrikeCustomFieldValue(quote.salesOrders),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.PRIMARY_CONTACT_NAME,
        value: this.sanitizeWrikeCustomFieldValue(quote.primaryContact?.name),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.PRIMARY_CONTACT_EMAIL,
        value: this.sanitizeWrikeCustomFieldValue(
          quote.primaryContact?.primaryEmail
        ),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.PRIMARY_CONTACT_PHONE,
        value: this.sanitizeWrikeCustomFieldValue(
          quote.primaryContact?.phoneWithExt
        ),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.PRIMARY_CONTACT_ID,
        value: this.sanitizeWrikeCustomFieldValue(quote.primaryContact?.id),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.PRIMARY_SALES_REP_ID,
        value: this.sanitizeWrikeCustomFieldValue(quote.primarySalesRep?.id),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.PRIMARY_SALES_REP_INITIALS,
        value: this.sanitizeWrikeCustomFieldValue(
          quote.primarySalesRep?.initials
        ),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.COMPANY_ID,
        value: this.sanitizeWrikeCustomFieldValue(quote.company?.id),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.COMPANY_NAME,
        value: this.sanitizeWrikeCustomFieldValue(quote.company?.name),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.COMPANY_PHONE,
        value: this.sanitizeWrikeCustomFieldValue(quote.company?.phoneWithExt),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.LEAD_SOURCE_ID,
        value: this.sanitizeWrikeCustomFieldValue(quote.leadSourceId),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.LINE_ITEMS,
        value: this.convertToPlainText(quote.lineItems),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.SHOPVOX_QUOTE_LINK,
        value: `<a href="${this.escapeHtml(
          `https://express.shopvox.com/transactions/quotes/${quote.id}`
        )}" target="_blank">QT #${this.escapeHtml(quote.txnNumber)}</a>`,
      },
      {
        id: WRIKE_CUSTOM_FIELDS.WORK_ORDER_LINKS,
        value: this.createWorkOrderLinks(quote.salesOrders),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.LINKED_ORDERS,
        value: await this.findAndLinkSalesOrderTasks(quote.salesOrders || []),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.INSTALL_ADDRESS,
        value: this.sanitizeWrikeCustomFieldValue(
          formatAddress(quote.installingAddress as ShopVoxAddress)
        ),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.FULFILLMENT_METHOD,
        value: this.determineFulfillmentMethod(quote.lineItems),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.TARGET_INSTALL_DATE,
        value: this.sanitizeWrikeCustomFieldValue(quote.dueDate),
      },
    ];

    // Add contact field mappings if the respective users exist in the quote
    const contactFields = [];

    // Project Manager
    if (quote.projectManager?.id) {
      contactFields.push({
        id: WRIKE_CUSTOM_FIELDS.PROJECT_MANAGER,
        value: mapShopVoxToWrikeUserId(quote.projectManager.id),
      });
    }

    // Production Manager
    if (quote.pm?.id) {
      contactFields.push({
        id: WRIKE_CUSTOM_FIELDS.PRODUCTION_MANAGER,
        value: mapShopVoxToWrikeUserId(quote.pm.id),
      });
    }

    // Estimator
    if (quote.estimator?.id) {
      contactFields.push({
        id: WRIKE_CUSTOM_FIELDS.ESTIMATOR,
        value: mapShopVoxToWrikeUserId(quote.estimator.id),
      });
    }

    // Sales Rep
    if (quote.primarySalesRep?.id) {
      contactFields.push({
        id: WRIKE_CUSTOM_FIELDS.SALES_REP,
        value: mapShopVoxToWrikeUserId(quote.primarySalesRep.id),
      });
    }

    // Created By - add only if present
    if (quote.createdBy?.id) {
      contactFields.push({
        id: WRIKE_CUSTOM_FIELDS.CREATED_BY,
        value: mapShopVoxToWrikeUserId(quote.createdBy.id),
      });
    }

    // Combine all custom fields
    return [...baseCustomFields, ...contactFields];
  }

  /**
   * Maps a ShopVox sales order to Wrike custom fields
   */
  private async mapSalesOrderToCustomFields(
    salesOrder: ShopVoxSalesOrder,
    customFields?: Record<string, string>
  ) {
    const baseCustomFields = [
      {
        id: WRIKE_CUSTOM_FIELDS.SHOPVOX_ID,
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.id),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.ACTIVE,
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.active),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.TITLE,
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.title),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.DESCRIPTION,
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.description),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.SO_CREATED_DATE,
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.txnDate),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.TXN_NUMBER,
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.txnNumber),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.SO_SUBTOTAL,
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.totalPriceInDollars
        ),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.TAX,
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.totalTaxInDollars),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.TOTAL_PRICE_WITH_TAX,
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.totalPriceWithTaxInDollars
        ),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.SV_STATUS,
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.workflowState),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.CUSTOMER_PO_NUMBER,
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.customerPoNumber),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.CUSTOMER_PO_DATE,
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.customerPoDate),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.DOWNPAYMENT_PERCENT,
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.downpaymentPercent
        ),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.SHIPPED_DATE,
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.shippingDate),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.IN_HAND_DATE_SALES_ORDER,
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.inHandDate),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.TARGET_INSTALL_DATE, // Target Install Date
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.dueDate),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.CREATED_AT,
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.createdAt),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.UPDATED_AT,
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.updatedAt),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.CREATED_BY_ID,
        value: this.convertToPlainText(salesOrder.createdBy),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.PRIMARY_CONTACT_NAME,
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.primaryContact?.name
        ),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.PRIMARY_CONTACT_EMAIL,
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.primaryContact?.email
        ),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.PRIMARY_CONTACT_PHONE,
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.primaryContact?.phoneWithExt
        ),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.PRIMARY_CONTACT_ID,
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.primaryContact?.id
        ),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.PRIMARY_SALES_REP_ID,
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.primarySalesRep?.id
        ),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.PRIMARY_SALES_REP_INITIALS,
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.primarySalesRep?.initials
        ),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.COMPANY_ID,
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.company?.id),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.COMPANY_NAME,
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.company?.name),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.COMPANY_PHONE,
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.company?.phoneWithExt
        ),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.LINE_ITEMS,
        value: this.convertToPlainText(salesOrder.lineItems),
      },
      // Sales Order specific fields
      {
        id: WRIKE_CUSTOM_FIELDS.PAYMENT_TOTAL,
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.totalPaymentsInDollars
        ),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.REMAINING_BALANCE,
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.balanceInDollars),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.LAST_INVOICED_AT,
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.lastInvoicedAt),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.LAST_INVOICED_ON,
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.lastInvoicedOn),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.INVOICED,
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.invoiced),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.FULLY_INVOICED,
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.fullyInvoiced),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.BILLING_ADDRESS_ID,
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.billingAddressId),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.SHIPPING_ADDRESS_ID,
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.shippingAddressId),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.TERM_CODE_ID,
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.termCodeId),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.SALES_TAX_ID,
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.salesTaxId),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.SHIPPING_METHOD_ID,
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.shippingMethodId),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.PRODUCTION_MANAGER_ID,
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.productionManagerId
        ),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.PROJECT_MANAGER_ID,
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.projectManagerId),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.SETUP_CHARGES_IN_DOLLARS,
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.setupChargesInDollars
        ),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.SETUP_CHARGES_TAXABLE,
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.setupChargesTaxable
        ),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.SETUP_CHARGES_IS_PERCENT,
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.setupChargesIsPercent
        ),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.SETUP_CHARGES_PERCENT,
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.setupChargesPercent
        ),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.SETUP_CHARGES_TAX_IN_DOLLARS,
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.setupChargesTaxInDollars
        ),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.MISC_CHARGES_TAXABLE,
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.miscChargesTaxable
        ),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.MISC_CHARGES_LABEL,
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.miscChargesLabel),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.MISC_CHARGES_IS_PERCENT,
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.miscChargesIsPercent
        ),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.MISC_CHARGES_PERCENT,
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.miscChargesPercent
        ),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.FINANCE_CHARGES_PERCENT,
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.financeChargesPercent
        ),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.COMPANY_SPECIAL_NOTES,
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.company?.specialNotes
        ),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.TERM_CODE_NAME,
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.termCode?.name),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.TAX_NAME,
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.tax?.name),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.UPDATED_BY,
        value: this.convertToPlainText(salesOrder.updatedBy),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.RELATED_TRANSACTIONS,
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.relatedTransactions
        ),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.ORDER_PAYMENTS,
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.orderPayments),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.PURCHASE_ORDER_LINE_ITEMS_TOTAL_PRICE,
        value: this.sanitizeWrikeCustomFieldValue(
          salesOrder.purchaseOrderLineItemsTotalPriceInDollars
        ),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.PURCHASE_ORDERS,
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.purchaseOrders),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.SIGNATURES,
        value: this.sanitizeWrikeCustomFieldValue(salesOrder.signatures),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.SHOPVOX_SALES_ORDER_LINK,
        value: `<a href="${this.escapeHtml(
          `https://express.shopvox.com/transactions/sales-orders/${salesOrder.id}`
        )}" target="_blank">SO #${this.escapeHtml(salesOrder.txnNumber)}</a>`,
      },
      {
        id: WRIKE_CUSTOM_FIELDS.LINKED_QUOTE,
        value: await this.findAndLinkQuoteTasks(
          salesOrder.relatedTransactions || []
        ),
      },
      {
        id: WRIKE_CUSTOM_FIELDS.FULFILLMENT_METHOD,
        value: this.determineFulfillmentMethod(salesOrder.lineItems),
      },
    ];

    // Add contact field mappings if the respective users exist in the sales order
    const contactFields = [];

    // Project Manager
    if (salesOrder.projectManager?.id) {
      contactFields.push({
        id: WRIKE_CUSTOM_FIELDS.PROJECT_MANAGER,
        value: mapShopVoxToWrikeUserId(salesOrder.projectManager.id),
      });
    }

    // Production Manager
    if ((salesOrder as any).productionManager?.id) {
      contactFields.push({
        id: WRIKE_CUSTOM_FIELDS.PRODUCTION_MANAGER,
        value: mapShopVoxToWrikeUserId(
          (salesOrder as any).productionManager.id
        ),
      });
    }

    // Sales Rep
    if (salesOrder.primarySalesRep?.id) {
      contactFields.push({
        id: WRIKE_CUSTOM_FIELDS.SALES_REP,
        value: mapShopVoxToWrikeUserId(salesOrder.primarySalesRep.id),
      });
    }

    // Created By - add only if present
    if (salesOrder.createdBy?.id) {
      contactFields.push({
        id: WRIKE_CUSTOM_FIELDS.CREATED_BY,
        value: mapShopVoxToWrikeUserId(salesOrder.createdBy.id),
      });
    }

    // Add address fields if provided
    const addressFields: any[] = [];
    if (customFields) {
      // Shipping Address
      if (customFields[WRIKE_CUSTOM_FIELDS.SHIPPING_ADDRESS]) {
        addressFields.push({
          id: WRIKE_CUSTOM_FIELDS.SHIPPING_ADDRESS,
          value: this.sanitizeWrikeCustomFieldValue(
            customFields[WRIKE_CUSTOM_FIELDS.SHIPPING_ADDRESS]
          ),
        });
      }

      // Billing Address
      if (customFields[WRIKE_CUSTOM_FIELDS.BILLING_ADDRESS]) {
        addressFields.push({
          id: WRIKE_CUSTOM_FIELDS.BILLING_ADDRESS,
          value: this.sanitizeWrikeCustomFieldValue(
            customFields[WRIKE_CUSTOM_FIELDS.BILLING_ADDRESS]
          ),
        });
      }

      // Install Address
      if (customFields[WRIKE_CUSTOM_FIELDS.INSTALL_ADDRESS]) {
        addressFields.push({
          id: WRIKE_CUSTOM_FIELDS.INSTALL_ADDRESS,
          value: this.sanitizeWrikeCustomFieldValue(
            customFields[WRIKE_CUSTOM_FIELDS.INSTALL_ADDRESS]
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
        description = description.substring(0, 5000) + "...";
      }
    } catch (error) {
      description = `<h2>📋 Quote Information</h2><p><strong>Quote ID:</strong> ${this.escapeHtml(
        quote.id
      )}</p><p><strong>Title:</strong> ${this.escapeHtml(quote.title)}</p>`;
    }

    const responsibles = quote.createdBy?.id
      ? [mapShopVoxToWrikeUserId(quote.createdBy.id)]
      : [];
    const parents = quote.createdBy?.id
      ? [
          mapShopVoxUserIdToWrikeFolderMapping(quote.createdBy.id)
            ?.wrikeFolderId.forQuotes,
        ]
      : [];

    if (quote.primarySalesRep?.id) {
      responsibles.push(mapShopVoxToWrikeUserId(quote.primarySalesRep.id));
      parents.push(
        mapShopVoxUserIdToWrikeFolderMapping(quote.primarySalesRep.id)
          ?.wrikeFolderId.forQuotes
      );
    }

    const requestBody: any = {
      title: `QT #${quote.txnNumber}: ${quote.title}`,
      description: description,
      responsibles,
      parents,
      customFields: await this.mapQuoteToCustomFields(quote),
      customStatus: mapShopVoxToWrikeStatusId(quote.workflowState),
      customItemTypeId: WRIKE_ITEM_TYPES.QUOTE, // Quote Custom Item Type ID
    };

    // Validate request body before sending
    try {
      JSON.stringify(requestBody);
    } catch (error) {
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
      throw new Error(errorMessage);
    }

    return await response.json();
  }

  /**
   * Gets a task by its Wrike task ID
   * Note: The /tasks/{id} endpoint does not support the fields parameter,
   * but returns custom fields by default
   * @param taskId - The Wrike task ID
   * @returns The task data including custom fields
   */
  async getTaskById(taskId: string): Promise<WrikeTaskSearchResult> {
    const response = await this.makeRequest(`${this.baseUrl}/tasks/${taskId}`, {
      method: "GET",
    });

    if (!response.ok) {
      let errorDetails = "";
      try {
        const errorResponse = await response.json();
        errorDetails = JSON.stringify(errorResponse, null, 2);
      } catch (e) {
        errorDetails = await response.text();
      }

      throw new Error(
        `Failed to get Wrike task: ${response.status} ${response.statusText}\nTask ID: ${taskId}\nError response: ${errorDetails}`
      );
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
          id: WRIKE_CUSTOM_FIELDS.SHOPVOX_ID, // shopvoxId
          comparator: "EqualTo",
          value: quoteId,
        },
      ]),
      fields: "[customFields]",
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
        description = description.substring(0, 5000) + "...";
      }
    } catch (error) {
      description = `<h2>📋 Quote Information</h2><p><strong>Quote ID:</strong> ${this.escapeHtml(
        quote.id
      )}</p><p><strong>Title:</strong> ${this.escapeHtml(quote.title)}</p>`;
    }

    const responsibles = quote.createdBy?.id
      ? [mapShopVoxToWrikeUserId(quote.createdBy.id)]
      : [];

    if (quote.primarySalesRep?.id) {
      responsibles.push(mapShopVoxToWrikeUserId(quote.primarySalesRep.id));
    }

    const requestBody: any = {
      title: `QT #${quote.txnNumber}: ${quote.title}`,
      description: description,
      addResponsibles: responsibles,
      customFields: await this.mapQuoteToCustomFields(quote),
      customStatus: mapShopVoxToWrikeStatusId(quote.workflowState),
    };

    if (oldResponsibles) {
      requestBody.removeResponsibles = oldResponsibles.map((r) => {
        return mapShopVoxToWrikeUserId(r);
      });

      requestBody.removeParents = oldResponsibles.map((r) => {
        return mapShopVoxUserIdToWrikeFolderMapping(r)?.wrikeFolderId.forQuotes;
      });
    }

    if (newResponsibles) {
      requestBody.addResponsibles = newResponsibles.map((r) => {
        return mapShopVoxToWrikeUserId(r);
      });

      requestBody.addParents = newResponsibles.map((r) => {
        return mapShopVoxUserIdToWrikeFolderMapping(r)?.wrikeFolderId.forQuotes;
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
        description = description.substring(0, 5000) + "...";
      }
    } catch (error) {
      description = `<h2>📋 Sales Order Information</h2><p><strong>Sales Order ID:</strong> ${this.escapeHtml(
        salesOrder.id
      )}</p><p><strong>Title:</strong> ${this.escapeHtml(
        salesOrder.title
      )}</p>`;
    }

    const responsibles = salesOrder.createdBy?.id
      ? [mapShopVoxToWrikeUserId(salesOrder.createdBy.id)]
      : [];
    const parents = salesOrder.createdBy?.id
      ? [
          mapShopVoxUserIdToWrikeFolderMapping(salesOrder.createdBy.id)
            ?.wrikeFolderId.forWosos,
        ]
      : [];

    if (salesOrder.projectManager?.id) {
      responsibles.push(mapShopVoxToWrikeUserId(salesOrder.projectManager.id));
      parents.push(
        mapShopVoxUserIdToWrikeFolderMapping(salesOrder.projectManager.id)
          ?.wrikeFolderId.forWosos
      );
    }

    if (salesOrder.primarySalesRep?.id) {
      responsibles.push(mapShopVoxToWrikeUserId(salesOrder.primarySalesRep.id));
      parents.push(
        mapShopVoxUserIdToWrikeFolderMapping(salesOrder.primarySalesRep.id)
          ?.wrikeFolderId.forWosos
      );
    }

    const requestBody: any = {
      title: `SO #${salesOrder.txnNumber}: ${salesOrder.title}`,
      description: description,
      responsibles,
      parents,
      customFields: await this.mapSalesOrderToCustomFields(
        salesOrder,
        customFields
      ),
      customItemTypeId: WRIKE_ITEM_TYPES.SALES_ORDER, // Sales Order Custom Item Type ID
    };

    // Validate request body before sending
    try {
      JSON.stringify(requestBody);
    } catch (error) {
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
          id: WRIKE_CUSTOM_FIELDS.SHOPVOX_ID, // shopvoxId
          comparator: "EqualTo",
          value: salesOrderId,
        },
      ]),
      fields: "[customFields]",
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
        description = description.substring(0, 5000) + "...";
      }
    } catch (error) {
      description = `<h2>📋 Sales Order Information</h2><p><strong>Sales Order ID:</strong> ${this.escapeHtml(
        salesOrder.id
      )}</p><p><strong>Title:</strong> ${this.escapeHtml(
        salesOrder.title
      )}</p>`;
    }

    const requestBody: any = {
      title: `SO #${salesOrder.txnNumber}: ${salesOrder.title}`,
      description: description,
      customFields: await this.mapSalesOrderToCustomFields(
        salesOrder,
        customFields
      ),
    };

    if (oldResponsibles) {
      requestBody.removeResponsibles = oldResponsibles.map((r) => {
        return mapShopVoxToWrikeUserId(r);
      });

      requestBody.removeParents = oldResponsibles.map((r) => {
        return mapShopVoxUserIdToWrikeFolderMapping(r)?.wrikeFolderId.forWosos;
      });
    }

    if (newResponsibles) {
      requestBody.addResponsibles = newResponsibles.map((r) => {
        return mapShopVoxToWrikeUserId(r);
      });

      requestBody.addParents = newResponsibles.map((r) => {
        return mapShopVoxUserIdToWrikeFolderMapping(r)?.wrikeFolderId.forWosos;
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
      throw new Error(errorMessage);
    }

    return await response.json();
  }

  /**
   * Updates a subtask in Wrike without setting a custom item type.
   * This method is used for copying parent task data to subtasks.
   * @param taskId - The Wrike task ID of the subtask
   * @param title - The new title for the subtask
   * @param description - The description to set on the subtask
   * @param customFields - Array of custom fields in Wrike format [{id, value}]
   */
  async updateSubtask(
    taskId: string,
    title: string,
    description: string,
    customFields: Array<{ id: string; value: string }>
  ): Promise<WrikeTaskUpdateResponse> {
    const requestBody: any = {
      title,
      description,
      customFields,
    };

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

      const errorMessage = `Failed to update Wrike subtask: ${
        response.status
      } ${response.statusText}\nTask ID: ${taskId}\nDescription length: ${
        description?.length || 0
      }\nRequest body: ${JSON.stringify(
        requestBody,
        null,
        2
      )}\nError response: ${errorDetails}`;
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
      return "<h2>📦 Line Items</h2><p>No line items</p>";
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
      return "<h2>📦 Line Items</h2><p>Error processing line items</p>";
    }
  }
}

// Export a singleton instance
export const wrikeService = new WrikeService();
