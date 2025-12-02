import { ShopVoxQuote } from "../schemas/quote.schema";
import { ShopVoxSalesOrder } from "../schemas/sales-order.schema";
import { withRetry, getRetryMetadata } from "../utils/retry";

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

    try {
      return await withRetry(
        async () => {
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
              `Failed to fetch quote from ShopVox: status ${response.status} ${response.statusText}\nQuote ID: ${quoteId}\nURL: ${url}\nError response: ${errorDetails}`
            );
          }

          const quote = await response.json();
          return quote;
        },
        {
          onRetry: (error, attempt, delayMs) => {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            console.log(
              `[ShopVox] Retry attempt ${attempt} for getQuote(${quoteId}) after ${delayMs}ms. Error: ${errorMessage}`
            );
          },
        }
      );
    } catch (error) {
      // Enhance error with retry metadata for better logging
      const retryMetadata = getRetryMetadata(error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      let enhancedMessage = errorMessage;
      if (retryMetadata) {
        enhancedMessage += `\nRetry attempts: ${retryMetadata.totalAttempts}`;
        if (retryMetadata.delays.length > 0) {
          enhancedMessage += `\nRetry delays: ${retryMetadata.delays.join(
            "ms, "
          )}ms`;
        }
        if (retryMetadata.errors.length > 1) {
          enhancedMessage += `\nAll errors: ${retryMetadata.errors.join(
            " | "
          )}`;
        }
      }

      const enhancedError = new Error(enhancedMessage);
      if (error instanceof Error && error.stack) {
        enhancedError.stack = error.stack;
      }
      (enhancedError as any).retryMetadata = retryMetadata;
      throw enhancedError;
    }
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

    try {
      return await withRetry(
        async () => {
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
              `Failed to fetch sales order from ShopVox: status ${response.status} ${response.statusText}\nSales Order ID: ${salesOrderId}\nURL: ${url}\nError response: ${errorDetails}`
            );
          }

          return await response.json();
        },
        {
          onRetry: (error, attempt, delayMs) => {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            console.log(
              `[ShopVox] Retry attempt ${attempt} for getSalesOrder(${salesOrderId}) after ${delayMs}ms. Error: ${errorMessage}`
            );
          },
        }
      );
    } catch (error) {
      // Enhance error with retry metadata for better logging
      const retryMetadata = getRetryMetadata(error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      let enhancedMessage = errorMessage;
      if (retryMetadata) {
        enhancedMessage += `\nRetry attempts: ${retryMetadata.totalAttempts}`;
        if (retryMetadata.delays.length > 0) {
          enhancedMessage += `\nRetry delays: ${retryMetadata.delays.join(
            "ms, "
          )}ms`;
        }
        if (retryMetadata.errors.length > 1) {
          enhancedMessage += `\nAll errors: ${retryMetadata.errors.join(
            " | "
          )}`;
        }
      }

      const enhancedError = new Error(enhancedMessage);
      if (error instanceof Error && error.stack) {
        enhancedError.stack = error.stack;
      }
      (enhancedError as any).retryMetadata = retryMetadata;
      throw enhancedError;
    }
  }

  /**
   * Fetches multiple sales orders by IDs from ShopVox
   */
  async getSalesOrders(salesOrderIds: string[]): Promise<ShopVoxSalesOrder[]> {
    const promises = salesOrderIds.map((id) => this.getSalesOrder(id));
    return Promise.all(promises);
  }

  /**
   * Fetches a sales order by transaction number from ShopVox
   * @param txnNumber - The transaction number (e.g., "10001")
   * @returns The sales order or null if not found
   */
  async getSalesOrderByTxnNumber(
    txnNumber: string
  ): Promise<ShopVoxSalesOrder | null> {
    const url = `${this.baseUrl}/sales_orders?account_id=${this.accountId}&authToken=${this.authToken}&txnNumber=${txnNumber}`;

    try {
      return await withRetry(
        async () => {
          const response = await fetch(url, {
            method: "GET",
            headers: this.getHeaders(),
          });

          // 404 or empty result means the txnNumber doesn't exist - not an error
          if (response.status === 404) {
            return null;
          }

          if (!response.ok) {
            let errorDetails = "";
            try {
              const errorResponse = await response.json();
              errorDetails = JSON.stringify(errorResponse, null, 2);
            } catch (e) {
              errorDetails = await response.text();
            }

            throw new Error(
              `Failed to fetch sales order from ShopVox: status ${response.status} ${response.statusText}\nTxn Number: ${txnNumber}\nURL: ${url}\nError response: ${errorDetails}`
            );
          }

          const result = await response.json();

          // The API returns a paginated response with salesOrders array
          if (result.salesOrders && result.salesOrders.length > 0) {
            return result.salesOrders[0];
          }

          return null;
        },
        {
          onRetry: (error, attempt, delayMs) => {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            console.log(
              `[ShopVox] Retry attempt ${attempt} for getSalesOrderByTxnNumber(${txnNumber}) after ${delayMs}ms. Error: ${errorMessage}`
            );
          },
        }
      );
    } catch (error) {
      // Enhance error with retry metadata for better logging
      const retryMetadata = getRetryMetadata(error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      let enhancedMessage = errorMessage;
      if (retryMetadata) {
        enhancedMessage += `\nRetry attempts: ${retryMetadata.totalAttempts}`;
        if (retryMetadata.delays.length > 0) {
          enhancedMessage += `\nRetry delays: ${retryMetadata.delays.join(
            "ms, "
          )}ms`;
        }
        if (retryMetadata.errors.length > 1) {
          enhancedMessage += `\nAll errors: ${retryMetadata.errors.join(
            " | "
          )}`;
        }
      }

      const enhancedError = new Error(enhancedMessage);
      if (error instanceof Error && error.stack) {
        enhancedError.stack = error.stack;
      }
      (enhancedError as any).retryMetadata = retryMetadata;
      throw enhancedError;
    }
  }

  /**
   * Fetches a quote by transaction number from ShopVox
   * @param txnNumber - The transaction number (e.g., "10001")
   * @returns The quote or null if not found
   */
  async getQuoteByTxnNumber(txnNumber: string): Promise<ShopVoxQuote | null> {
    const url = `${this.baseUrl}/quotes?account_id=${this.accountId}&authToken=${this.authToken}&txnNumber=${txnNumber}`;

    try {
      return await withRetry(
        async () => {
          const response = await fetch(url, {
            method: "GET",
            headers: this.getHeaders(),
          });

          // 404 or empty result means the txnNumber doesn't exist - not an error
          if (response.status === 404) {
            return null;
          }

          if (!response.ok) {
            let errorDetails = "";
            try {
              const errorResponse = await response.json();
              errorDetails = JSON.stringify(errorResponse, null, 2);
            } catch (e) {
              errorDetails = await response.text();
            }

            throw new Error(
              `Failed to fetch quote from ShopVox: status ${response.status} ${response.statusText}\nTxn Number: ${txnNumber}\nURL: ${url}\nError response: ${errorDetails}`
            );
          }

          const result = await response.json();

          // The API returns a paginated response with quotes array
          if (result.quotes && result.quotes.length > 0) {
            return result.quotes[0];
          }

          return null;
        },
        {
          onRetry: (error, attempt, delayMs) => {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            console.log(
              `[ShopVox] Retry attempt ${attempt} for getQuoteByTxnNumber(${txnNumber}) after ${delayMs}ms. Error: ${errorMessage}`
            );
          },
        }
      );
    } catch (error) {
      // Enhance error with retry metadata for better logging
      const retryMetadata = getRetryMetadata(error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      let enhancedMessage = errorMessage;
      if (retryMetadata) {
        enhancedMessage += `\nRetry attempts: ${retryMetadata.totalAttempts}`;
        if (retryMetadata.delays.length > 0) {
          enhancedMessage += `\nRetry delays: ${retryMetadata.delays.join(
            "ms, "
          )}ms`;
        }
        if (retryMetadata.errors.length > 1) {
          enhancedMessage += `\nAll errors: ${retryMetadata.errors.join(
            " | "
          )}`;
        }
      }

      const enhancedError = new Error(enhancedMessage);
      if (error instanceof Error && error.stack) {
        enhancedError.stack = error.stack;
      }
      (enhancedError as any).retryMetadata = retryMetadata;
      throw enhancedError;
    }
  }

  /**
   * Fetches all sales orders with pagination support
   * @param page - Page number (defaults to 1)
   * @param perPage - Number of items per page (defaults to 100)
   * @param includeInactive - Include inactive sales orders (defaults to true)
   * @returns Paginated sales orders response
   */
  async getAllSalesOrders(
    page: number = 1,
    perPage: number = 100,
    includeInactive: boolean = true
  ): Promise<{
    stats: {
      totalCount: number;
      page: number;
      perPage: number;
      totalPages: number;
      prevPage: number | null;
      nextPage: number | null;
      outOfRange: boolean;
    };
    salesOrders: ShopVoxSalesOrder[];
  }> {
    // Try using wildcard or minimal search - empty string doesn't work
    // Using a space character which might match more records
    const url = `${this.baseUrl}/sales_orders?account_id=${this.accountId}&authToken=${this.authToken}&page=${page}&perPage=${perPage}&title=%20`;

    try {
      return await withRetry(
        async () => {
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
              `Failed to fetch sales orders from ShopVox: status ${response.status} ${response.statusText}\nPage: ${page}, PerPage: ${perPage}\nURL: ${url}\nError response: ${errorDetails}`
            );
          }

          return await response.json();
        },
        {
          onRetry: (error, attempt, delayMs) => {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            console.log(
              `[ShopVox] Retry attempt ${attempt} for getAllSalesOrders(page=${page}, perPage=${perPage}) after ${delayMs}ms. Error: ${errorMessage}`
            );
          },
        }
      );
    } catch (error) {
      // Enhance error with retry metadata for better logging
      const retryMetadata = getRetryMetadata(error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      let enhancedMessage = errorMessage;
      if (retryMetadata) {
        enhancedMessage += `\nRetry attempts: ${retryMetadata.totalAttempts}`;
        if (retryMetadata.delays.length > 0) {
          enhancedMessage += `\nRetry delays: ${retryMetadata.delays.join(
            "ms, "
          )}ms`;
        }
        if (retryMetadata.errors.length > 1) {
          enhancedMessage += `\nAll errors: ${retryMetadata.errors.join(
            " | "
          )}`;
        }
      }

      const enhancedError = new Error(enhancedMessage);
      if (error instanceof Error && error.stack) {
        enhancedError.stack = error.stack;
      }
      (enhancedError as any).retryMetadata = retryMetadata;
      throw enhancedError;
    }
  }

  /**
   * Fetches all quotes with pagination support
   * @param page - Page number (defaults to 1)
   * @param perPage - Number of items per page (defaults to 100)
   * @param includeInactive - Include inactive quotes (defaults to true)
   * @returns Paginated quotes response
   */
  async getAllQuotes(
    page: number = 1,
    perPage: number = 100,
    includeInactive: boolean = true
  ): Promise<{
    stats: {
      totalCount: number;
      page: number;
      perPage: number;
      totalPages: number;
      prevPage: number | null;
      nextPage: number | null;
      outOfRange: boolean;
    };
    quotes: ShopVoxQuote[];
  }> {
    // Try using wildcard or minimal search - empty string doesn't work
    // Using a space character which might match more records
    const url = `${this.baseUrl}/quotes?account_id=${this.accountId}&authToken=${this.authToken}&page=${page}&perPage=${perPage}&title=%20`;

    try {
      return await withRetry(
        async () => {
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
              `Failed to fetch quotes from ShopVox: status ${response.status} ${response.statusText}\nPage: ${page}, PerPage: ${perPage}\nURL: ${url}\nError response: ${errorDetails}`
            );
          }

          return await response.json();
        },
        {
          onRetry: (error, attempt, delayMs) => {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            console.log(
              `[ShopVox] Retry attempt ${attempt} for getAllQuotes(page=${page}, perPage=${perPage}) after ${delayMs}ms. Error: ${errorMessage}`
            );
          },
        }
      );
    } catch (error) {
      // Enhance error with retry metadata for better logging
      const retryMetadata = getRetryMetadata(error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      let enhancedMessage = errorMessage;
      if (retryMetadata) {
        enhancedMessage += `\nRetry attempts: ${retryMetadata.totalAttempts}`;
        if (retryMetadata.delays.length > 0) {
          enhancedMessage += `\nRetry delays: ${retryMetadata.delays.join(
            "ms, "
          )}ms`;
        }
        if (retryMetadata.errors.length > 1) {
          enhancedMessage += `\nAll errors: ${retryMetadata.errors.join(
            " | "
          )}`;
        }
      }

      const enhancedError = new Error(enhancedMessage);
      if (error instanceof Error && error.stack) {
        enhancedError.stack = error.stack;
      }
      (enhancedError as any).retryMetadata = retryMetadata;
      throw enhancedError;
    }
  }

  /**
   * Updates a sales order in ShopVox
   * @param salesOrderId - The sales order ID to update
   * @param updates - Object containing fields to update
   */
  async updateSalesOrder(
    salesOrderId: string,
    updates: {
      dueDate?: string;
      estimatorId?: string;
      primarySalesRepId?: string;
      productionManagerId?: string;
      projectManagerId?: string;
    }
  ): Promise<void> {
    const url = `${this.baseUrl}/sales_orders/${salesOrderId}?account_id=${this.accountId}&authToken=${this.authToken}`;

    const requestBody: any = {
      workOrder: {},
    };

    if (updates.dueDate) requestBody.workOrder.dueDate = updates.dueDate;
    if (updates.estimatorId)
      requestBody.workOrder.estimatorId = updates.estimatorId;
    if (updates.primarySalesRepId)
      requestBody.workOrder.primarySalesRepId = updates.primarySalesRepId;
    if (updates.productionManagerId)
      requestBody.workOrder.productionManagerId = updates.productionManagerId;
    if (updates.projectManagerId)
      requestBody.workOrder.projectManagerId = updates.projectManagerId;

    try {
      await withRetry(
        async () => {
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
              `Failed to update sales order in ShopVox: status ${
                response.status
              } ${
                response.statusText
              }\nSales Order ID: ${salesOrderId}\nUpdates: ${JSON.stringify(
                updates
              )}\nURL: ${url}\nError response: ${errorDetails}`
            );
          }
        },
        {
          onRetry: (error, attempt, delayMs) => {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            console.log(
              `[ShopVox] Retry attempt ${attempt} for updateSalesOrder(${salesOrderId}) after ${delayMs}ms. Error: ${errorMessage}`
            );
          },
        }
      );
    } catch (error) {
      // Enhance error with retry metadata for better logging
      const retryMetadata = getRetryMetadata(error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      let enhancedMessage = errorMessage;
      if (retryMetadata) {
        enhancedMessage += `\nRetry attempts: ${retryMetadata.totalAttempts}`;
        if (retryMetadata.delays.length > 0) {
          enhancedMessage += `\nRetry delays: ${retryMetadata.delays.join(
            "ms, "
          )}ms`;
        }
        if (retryMetadata.errors.length > 1) {
          enhancedMessage += `\nAll errors: ${retryMetadata.errors.join(
            " | "
          )}`;
        }
      }

      const enhancedError = new Error(enhancedMessage);
      if (error instanceof Error && error.stack) {
        enhancedError.stack = error.stack;
      }
      (enhancedError as any).retryMetadata = retryMetadata;
      throw enhancedError;
    }
  }
}

// Export a singleton instance
export const shopvoxService = new ShopVoxService();
