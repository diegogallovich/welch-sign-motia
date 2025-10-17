import { ShopVoxQuote } from "../schemas/quote.schema";
import { ShopVoxSalesOrder } from "../schemas/sales-order.schema";

export class ShopVoxService {
  private readonly baseUrl = "https://api.shopvox.com/v1";
  private readonly accountId: string;
  private readonly authToken: string;

  constructor() {
    this.accountId = process.env.SHOPVOX_ACCOUNT_ID!;
    this.authToken = process.env.SHOPVOX_AUTH_TOKEN!;

    if (!this.accountId || !this.authToken) {
      throw new Error(
        "Missing required ShopVox environment variables: SHOPVOX_ACCOUNT_ID, SHOPVOX_AUTH_TOKEN"
      );
    }
  }

  private getHeaders() {
    return {
      "Content-Type": "application/json",
    };
  }

  /**
   * Fetches a quote by ID from ShopVox
   */
  async getQuote(quoteId: string): Promise<ShopVoxQuote> {
    const url = `${this.baseUrl}/quotes/${quoteId}?account_id=${this.accountId}&authToken=${this.authToken}`;

    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(),
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
        `Failed to fetch quote from ShopVox: ${response.status} ${response.statusText}\nQuote ID: ${quoteId}\nURL: ${url}\nError response: ${errorDetails}`
      );
    }

    const quote = await response.json();
    return quote;
  }

  /**
   * Fetches multiple quotes by IDs from ShopVox
   */
  async getQuotes(quoteIds: string[]): Promise<ShopVoxQuote[]> {
    const promises = quoteIds.map((id) => this.getQuote(id));
    return Promise.all(promises);
  }

  /**
   * Fetches a sales order by ID from ShopVox
   */
  async getSalesOrder(salesOrderId: string): Promise<ShopVoxSalesOrder> {
    const url = `${this.baseUrl}/sales_orders/${salesOrderId}?account_id=${this.accountId}&authToken=${this.authToken}`;

    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(),
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
        `Failed to fetch sales order from ShopVox: ${response.status} ${response.statusText}\nSales Order ID: ${salesOrderId}\nURL: ${url}\nError response: ${errorDetails}`
      );
    }

    return await response.json();
  }

  /**
   * Fetches multiple sales orders by IDs from ShopVox
   */
  async getSalesOrders(salesOrderIds: string[]): Promise<ShopVoxSalesOrder[]> {
    const promises = salesOrderIds.map((id) => this.getSalesOrder(id));
    return Promise.all(promises);
  }

  /**
   * Updates a sales order's due date in ShopVox
   * @param salesOrderId - The sales order ID to update
   * @param dueDate - The new due date (format: YYYY-MM-DD)
   */
  async updateSalesOrder(salesOrderId: string, dueDate: string): Promise<void> {
    const url = `${this.baseUrl}/sales_orders/${salesOrderId}?account_id=${this.accountId}&authToken=${this.authToken}`;

    const requestBody = {
      workOrder: {
        dueDate: dueDate,
      },
    };

    const response = await fetch(url, {
      method: "PUT",
      headers: this.getHeaders(),
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

      throw new Error(
        `Failed to update sales order in ShopVox: ${response.status} ${response.statusText}\nSales Order ID: ${salesOrderId}\nDue Date: ${dueDate}\nURL: ${url}\nError response: ${errorDetails}`
      );
    }
  }
}

// Export a singleton instance
export const shopvoxService = new ShopVoxService();
