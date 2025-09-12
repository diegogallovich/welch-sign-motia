import { ShopVoxQuote } from "../schemas/quote.schema";

export class ShopVoxService {
    private readonly baseUrl = "https://api.shopvox.com/v1";
    private readonly accountId: string;
    private readonly authToken: string;

    constructor() {
        this.accountId = process.env.SHOPVOX_ACCOUNT_ID!;
        this.authToken = process.env.SHOPVOX_AUTH_TOKEN!;
        
        if (!this.accountId || !this.authToken) {
            throw new Error("Missing required ShopVox environment variables: SHOPVOX_ACCOUNT_ID, SHOPVOX_AUTH_TOKEN");
        }
    }

    private getHeaders() {
        return {
            "Content-Type": "application/json"
        };
    }

    /**
     * Fetches a quote by ID from ShopVox
     */
    async getQuote(quoteId: string): Promise<ShopVoxQuote> {
        const url = `${this.baseUrl}/quotes/${quoteId}?account_id=${this.accountId}&authToken=${this.authToken}`;
        
        const response = await fetch(url, {
            method: "GET",
            headers: this.getHeaders()
        });

        if (!response.ok) {
            let errorDetails = '';
            try {
                const errorResponse = await response.json();
                errorDetails = JSON.stringify(errorResponse, null, 2);
            } catch (e) {
                errorDetails = await response.text();
            }
            
            throw new Error(`Failed to fetch quote from ShopVox: ${response.status} ${response.statusText}\nQuote ID: ${quoteId}\nURL: ${url}\nError response: ${errorDetails}`);
        }

        return await response.json();
    }

    /**
     * Fetches multiple quotes by IDs from ShopVox
     */
    async getQuotes(quoteIds: string[]): Promise<ShopVoxQuote[]> {
        const promises = quoteIds.map(id => this.getQuote(id));
        return Promise.all(promises);
    }
}

// Export a singleton instance
export const shopvoxService = new ShopVoxService();
