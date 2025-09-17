import { ShopVoxQuote } from "../schemas/quote.schema";
import { mapShopVoxToWrikeUserId } from "../user-mapping";

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

    constructor() {
        this.authToken = process.env.WRIKE_PERMANENT_TOKEN!;
        this.quotesDbId = process.env.WRIKE_QUOTES_DB_ID!;
        
        if (!this.authToken || !this.quotesDbId) {
            throw new Error("Missing required Wrike environment variables: WRIKE_PERMANENT_TOKEN, WRIKE_QUOTES_DB_ID");
        }

        // Log configuration (without sensitive data)
        console.log(`WrikeService initialized with folder ID: ${this.quotesDbId}`);
    }

    private getHeaders() {
        return {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.authToken}`,
        };
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
        } else if (typeof value === 'object') {
            // Convert object to nested list format
            stringValue = this.formatObjectAsPlainText(value);
        } else {
            // Convert primitive values to string
            stringValue = String(value);
        }
        
        // Remove control characters (U+0000 through U+001F)
        stringValue = stringValue.replace(/[\u0000-\u001F]/g, '');
        
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
        
        const paragraphs = arr.map((item, index) => {
            if (typeof item === 'object' && item !== null) {
                return `<p><strong>Item ${index + 1}:</strong><br/>${this.formatObjectAsPlainText(item)}</p>`;
            } else {
                return `<p><strong>Item ${index + 1}:</strong> ${this.escapeHtml(String(item))}</p>`;
            }
        }).join('');
        
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
        
        const paragraphs = entries.map(([key, value]) => {
            const formattedKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
            
            if (Array.isArray(value)) {
                return `<p><strong>${this.escapeHtml(formattedKey)}:</strong><br/>${this.formatArrayAsPlainText(value)}</p>`;
            } else if (typeof value === 'object' && value !== null) {
                return `<p><strong>${this.escapeHtml(formattedKey)}:</strong><br/>${this.formatObjectAsPlainText(value)}</p>`;
            } else {
                return `<p><strong>${this.escapeHtml(formattedKey)}:</strong> ${this.escapeHtml(String(value))}</p>`;
            }
        }).join('');
        
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
            result = value.map((item, index) => {
                if (typeof item === 'object' && item !== null) {
                    return `Item ${index + 1}: ${this.convertObjectToPlainText(item)}`;
                } else {
                    return `Item ${index + 1}: ${String(item)}`;
                }
            }).join('\n');
        } else if (typeof value === 'object') {
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
        
        return entries.map(([key, value]) => {
            const formattedKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
            
            if (Array.isArray(value)) {
                return `${formattedKey}: ${this.convertToPlainText(value)}`;
            } else if (typeof value === 'object' && value !== null) {
                return `${formattedKey}: ${this.convertObjectToPlainText(value)}`;
            } else {
                return `${formattedKey}: ${String(value)}`;
            }
        }).join('\n');
    }

    /**
     * Escapes HTML special characters to prevent XSS and ensure proper display
     */
    private escapeHtml(text: string): string {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Creates HTML anchor tags for ShopVox work orders from sales orders array
     */
    private createWorkOrderLinks(salesOrders: any[]): string {
        if (!salesOrders || salesOrders.length === 0) {
            return '';
        }

        const links = salesOrders
            .filter(order => order && order.id && order.txnNumber) // Filter out invalid orders
            .map(order => {
                const url = `https://api.shopvox.com/edge//work_orders/${order.id}/pdf_document?pdf_type=WorkOrder`;
                const displayText = `SO #${order.txnNumber}`;
                return `<a href="${this.escapeHtml(url)}" target="_blank">${this.escapeHtml(displayText)}</a>`;
            })
            .join(', ');

        return links;
    }

    /**
     * Cleans HTML tags from text while preserving the content
     */
    private cleanHtmlTags(text: string): string {
        if (!text) return '';
        return String(text)
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/&nbsp;/g, ' ') // Replace non-breaking spaces
            .replace(/&amp;/g, '&') // Decode HTML entities
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .trim();
    }

    /**
     * Maps a ShopVox quote to Wrike custom fields
     */
    private mapQuoteToCustomFields(quote: ShopVoxQuote) {
        const baseCustomFields = [
            {
                id: 'IEADYYMRJUAJFPCR',
                value: this.sanitizeWrikeCustomFieldValue(quote.id),
            },
            {
                id: 'IEADYYMRJUAJFPY4',
                value: this.sanitizeWrikeCustomFieldValue(quote.active),
            },
            {
                id: 'IEADYYMRJUAJFPY5',
                value: this.sanitizeWrikeCustomFieldValue(quote.title),
            },
            {
                id: 'IEADYYMRJUAJFPZB',
                value: this.sanitizeWrikeCustomFieldValue(quote.description),
            },
            {
                id: 'IEADYYMRJUAJFPZC',
                value: this.sanitizeWrikeCustomFieldValue(quote.txnDate),
            },
            {
                id: 'IEADYYMRJUAJFP3B',
                value: this.sanitizeWrikeCustomFieldValue(quote.txnNumber),
            },
            {
                id: 'IEADYYMRJUAJFPZD',
                value: this.sanitizeWrikeCustomFieldValue(quote.totalPriceInDollars),
            },
            {
                id: 'IEADYYMRJUAJFPZF',
                value: this.sanitizeWrikeCustomFieldValue(quote.totalTaxInDollars),
            },
            {
                id: 'IEADYYMRJUAJFPZH',
                value: this.sanitizeWrikeCustomFieldValue(quote.totalPriceWithTaxInDollars),
            },
            {
                id: 'IEADYYMRJUAJFP2V',
                value: this.sanitizeWrikeCustomFieldValue(quote.workflowState),
            },
            {
                id: 'IEADYYMRJUAJFP27',
                value: this.sanitizeWrikeCustomFieldValue(quote.expiryDate),
            },
            {
                id: 'IEADYYMRJUAJFQR5',
                value: this.sanitizeWrikeCustomFieldValue(quote.nextContactDate),
            },
            {
                id: 'IEADYYMRJUAJFQR6',
                value: this.sanitizeWrikeCustomFieldValue(quote.potentialClosingDate),
            },
            {
                id: 'IEADYYMRJUAJFQR7',
                value: this.sanitizeWrikeCustomFieldValue(quote.closingPotential),
            },
            {
                id: 'IEADYYMRJUAJFQSC',
                value: this.sanitizeWrikeCustomFieldValue(quote.customerPoNumber),
            },
            {
                id: 'IEADYYMRJUAJFQSE',
                value: this.sanitizeWrikeCustomFieldValue(quote.customerPoDate),
            },
            {
                id: 'IEADYYMRJUAJFQSF',
                value: this.sanitizeWrikeCustomFieldValue(quote.autoExpire),
            },
            {
                id: 'IEADYYMRJUAJFQSH',
                value: this.sanitizeWrikeCustomFieldValue(quote.downpaymentPercent),
            },
            {
                id: 'IEADYYMRJUAJFQSJ',
                value: this.sanitizeWrikeCustomFieldValue(quote.shippingTracking),
            },
            {
                id: 'IEADYYMRJUAJFQSL',
                value: this.sanitizeWrikeCustomFieldValue(quote.shippingDate),
            },
            {
                id: 'IEADYYMRJUAJFSVG',
                value: this.sanitizeWrikeCustomFieldValue(quote.createdAt),
            },
            {
                id: 'IEADYYMRJUAJFSWB',
                value: this.sanitizeWrikeCustomFieldValue(quote.updatedAt),
            },
            {
                id: 'IEADYYMRJUAJFSWE',
                value: this.sanitizeWrikeCustomFieldValue(quote.lastNote),
            },
            {
                id: 'IEADYYMRJUAJFSWF',
                value: this.sanitizeWrikeCustomFieldValue(quote.age),
            },
            {
                id: 'IEADYYMRJUAJFSWJ',
                value: this.sanitizeWrikeCustomFieldValue(quote.lastEmailedDate),
            },
            {
                id: 'IEADYYMRJUAJFSWM',
                value: this.sanitizeWrikeCustomFieldValue(quote.quoteFor),
            },
            {
                id: 'IEADYYMRJUAJFSWP',
                value: this.sanitizeWrikeCustomFieldValue(quote.customerNote),
            },
            {
                id: 'IEADYYMRJUAJFSWW',
                value: this.sanitizeWrikeCustomFieldValue(quote.site),
            },
            {
                id: 'IEADYYMRJUAJFSWX',
                value: this.sanitizeWrikeCustomFieldValue(quote.quickQuote),
            },
            {
                id: 'IEADYYMRJUAJFSWY',
                value: this.sanitizeWrikeCustomFieldValue(quote.inHandDate),
            },
            {
                id: 'IEADYYMRJUAJFSW5',
                value: this.convertToPlainText(quote.createdBy),
            },
            {
                id: 'IEADYYMRJUAJFSXF',
                value: this.sanitizeWrikeCustomFieldValue(quote.salesOrders),
            },
            {
                id: 'IEADYYMRJUAJFSXH',
                value: this.sanitizeWrikeCustomFieldValue(quote.primaryContact?.name),
            },
            {
                id: 'IEADYYMRJUAJFSXI',
                value: this.sanitizeWrikeCustomFieldValue(quote.primaryContact?.primaryEmail),
            },
            {
                id: 'IEADYYMRJUAJFSXJ',
                value: this.sanitizeWrikeCustomFieldValue(quote.primaryContact?.phoneWithExt),
            },
            {
                id: 'IEADYYMRJUAJFSXK',
                value: this.sanitizeWrikeCustomFieldValue(quote.primaryContact?.id),
            },
            {
                id: 'IEADYYMRJUAJFSXM',
                value: this.sanitizeWrikeCustomFieldValue(quote.primarySalesRep?.id),
            },
            {
                id: 'IEADYYMRJUAJFSXO',
                value: this.sanitizeWrikeCustomFieldValue(quote.primarySalesRep?.initials),
            },
            {
                id: 'IEADYYMRJUAJFSXP',
                value: this.sanitizeWrikeCustomFieldValue(quote.company?.id),
            },
            {
                id: 'IEADYYMRJUAJFSXR',
                value: this.sanitizeWrikeCustomFieldValue(quote.company?.name),
            },
            {
                id: 'IEADYYMRJUAJFSXV',
                value: this.sanitizeWrikeCustomFieldValue(quote.company?.phoneWithExt),
            },
            {
                id: 'IEADYYMRJUAJFSXW',
                value: this.sanitizeWrikeCustomFieldValue(quote.leadSourceId),
            },
            {
                id: 'IEADYYMRJUAJFSX2',
                value: this.convertToPlainText(quote.lineItems),
            },
            {
                id: 'IEADYYMRJUAJG7E4',
                value: `<a href="${this.escapeHtml(`https://express.shopvox.com/transactions/quotes/${quote.id}`)}" target="_blank">QT #${this.escapeHtml(quote.txnNumber)}</a>`,
            },
            {
                id: 'IEADYYMRJUAJJ6HA',
                value: this.createWorkOrderLinks(quote.salesOrders),
            },
        ];

        // Add contact field mappings if the respective users exist in the quote
        const contactFields = [];

        // Project Manager (IEADYYMRJUAJIFD5)
        if (quote.projectManager?.id) {
            contactFields.push({
                id: 'IEADYYMRJUAJIFD5',
                value: mapShopVoxToWrikeUserId(quote.projectManager.id),
            });
        }

        // Production Manager (IEADYYMRJUAJIFEE) 
        if (quote.pm?.id) {
            contactFields.push({
                id: 'IEADYYMRJUAJIFEE',
                value: mapShopVoxToWrikeUserId(quote.pm.id),
            });
        }

        // Estimator (IEADYYMRJUAJIFEM)
        if (quote.estimator?.id) {
            contactFields.push({
                id: 'IEADYYMRJUAJIFEM',
                value: mapShopVoxToWrikeUserId(quote.estimator.id),
            });
        }

        // Sales Rep (IEADYYMRJUAJFSXL)
        if (quote.primarySalesRep?.id) {
            contactFields.push({
                id: 'IEADYYMRJUAJFSXL',
                value: mapShopVoxToWrikeUserId(quote.primarySalesRep.id),
            });
        }

        // Created By (IEADYYMRJUAJIFEN) - always present
        contactFields.push({
            id: 'IEADYYMRJUAJIFEN',
            value: mapShopVoxToWrikeUserId(quote.createdBy.id),
        });

        // Combine all custom fields
        return [...baseCustomFields, ...contactFields];
    }

    /**
     * Creates a new task in Wrike from a ShopVox quote
     */
    async createQuoteTask(quote: ShopVoxQuote): Promise<WrikeTaskCreateResponse> {
        // Validate required fields
        if (!quote.title || quote.title.trim() === '') {
            throw new Error('Quote title is required but was empty or undefined');
        }

        let description: string;
        try {
            description = this.createWrikeQuoteTaskDescription(quote);
            // Wrike has a limit on description length, truncate if necessary
            if (description.length > 5000) {
                console.warn(`Description too long (${description.length} chars), truncating to 5000 chars`);
                description = description.substring(0, 5000) + '...';
            }
        } catch (error) {
            console.error('Error creating task description:', error);
            description = `<h2>📋 Quote Information</h2><p><strong>Quote ID:</strong> ${this.escapeHtml(quote.id)}</p><p><strong>Title:</strong> ${this.escapeHtml(quote.title)}</p>`;
        }

        const requestBody: any = {
            title: `QT #${quote.txnNumber}: ${quote.title}`,
            description: description,
            customFields: this.mapQuoteToCustomFields(quote),
        };

        // Only add dates if dueDate is valid
        if (quote.dueDate && quote.dueDate.trim() !== '') {
            requestBody.dates = {
                due: this.sanitizeWrikeCustomFieldValue(quote.dueDate),
            };
        }

        // Log the request for debugging (without sensitive data)
        console.log(`Creating Wrike task for quote ${quote.id} with title: "${quote.title}"`);
        console.log(`Request body description length: ${requestBody.description?.length || 0} characters`);
        console.log(`Custom fields count: ${requestBody.customFields?.length || 0}`);

        // Validate request body before sending
        try {
            JSON.stringify(requestBody);
        } catch (error) {
            console.error('Request body is not serializable:', error);
            throw new Error(`Request body serialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        const response = await fetch(`${this.baseUrl}/folders/${this.quotesDbId}/tasks`, {
            method: "POST",
            headers: this.getHeaders(),
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            let errorDetails = '';
            try {
                const errorResponse = await response.json();
                errorDetails = JSON.stringify(errorResponse, null, 2);
            } catch (e) {
                errorDetails = await response.text();
            }
            
            const errorMessage = `Failed to create Wrike task: ${response.status} ${response.statusText}\nQuote ID: ${quote.id}\nQuote Title: "${quote.title}"\nDescription length: ${requestBody.description?.length || 0}\nRequest body: ${JSON.stringify(requestBody, null, 2)}\nError response: ${errorDetails}`;
            console.error('Wrike API Error:', errorMessage);
            throw new Error(errorMessage);
        }

        return await response.json();
    }

    /**
     * Searches for a task by ShopVox quote ID
     */
    async findTaskByQuoteId(quoteId: string): Promise<WrikeTaskSearchResult> {
        const params = new URLSearchParams({
            customFields: JSON.stringify([{
                id: 'IEADYYMRJUAJFPCR', // shopvoxId
                comparator: 'EqualTo',
                value: quoteId,
            }])
        });

        const response = await fetch(`${this.baseUrl}/folders/${this.quotesDbId}/tasks?${params.toString()}`, {
            method: "GET",
            headers: this.getHeaders(),
        });

        if (!response.ok) {
            let errorDetails = '';
            try {
                const errorResponse = await response.json();
                errorDetails = JSON.stringify(errorResponse, null, 2);
            } catch (e) {
                errorDetails = await response.text();
            }
            
            throw new Error(`Failed to search Wrike tasks: ${response.status} ${response.statusText}\nSearch params: ${params.toString()}\nError response: ${errorDetails}`);
        }

        return await response.json();
    }

    /**
     * Updates an existing task in Wrike from a ShopVox quote
     */
    async updateQuoteTask(taskId: string, quote: ShopVoxQuote): Promise<WrikeTaskUpdateResponse> {
        let description: string;
        try {
            description = this.createWrikeQuoteTaskDescription(quote);
            // Wrike has a limit on description length, truncate if necessary
            if (description.length > 5000) {
                console.warn(`Description too long (${description.length} chars), truncating to 5000 chars`);
                description = description.substring(0, 5000) + '...';
            }
        } catch (error) {
            console.error('Error creating task description:', error);
            description = `<h2>📋 Quote Information</h2><p><strong>Quote ID:</strong> ${this.escapeHtml(quote.id)}</p><p><strong>Title:</strong> ${this.escapeHtml(quote.title)}</p>`;
        }

        const requestBody: any = {
            title: `QT #${quote.txnNumber}: ${quote.title}`,
            description: description,
            customFields: this.mapQuoteToCustomFields(quote),
        };

        // Only add dates if dueDate is valid
        if (quote.dueDate && quote.dueDate.trim() !== '') {
            requestBody.dates = {
                due: this.sanitizeWrikeCustomFieldValue(quote.dueDate),
            };
        }

        const response = await fetch(`${this.baseUrl}/tasks/${taskId}`, {
            method: "PUT",
            headers: this.getHeaders(),
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            let errorDetails = '';
            try {
                const errorResponse = await response.json();
                errorDetails = JSON.stringify(errorResponse, null, 2);
            } catch (e) {
                errorDetails = await response.text();
            }
            
            const errorMessage = `Failed to update Wrike task: ${response.status} ${response.statusText}\nTask ID: ${taskId}\nDescription length: ${requestBody.description?.length || 0}\nRequest body: ${JSON.stringify(requestBody, null, 2)}\nError response: ${errorDetails}`;
            console.error('Wrike API Error:', errorMessage);
            throw new Error(errorMessage);
        }

        return await response.json();
    }

    /**
     * Creates or updates a quote task in Wrike
     * Returns the task ID and whether it was created or updated
     */
    async createOrUpdateQuoteTask(quote: ShopVoxQuote): Promise<{ taskId: string; wasCreated: boolean }> {
        try {
            console.log(`Starting createOrUpdateQuoteTask for quote ${quote.id}`);
            
        // First, try to find existing task
            console.log(`Searching for existing task with quote ID: ${quote.id}`);
        const searchResult = await this.findTaskByQuoteId(quote.id);
            console.log(`Search result: ${searchResult.data.length} tasks found`);
        
        if (searchResult.data.length > 0) {
            // Task exists, update it
            const taskId = searchResult.data[0].id;
                console.log(`Updating existing task: ${taskId}`);
            await this.updateQuoteTask(taskId, quote);
                console.log(`Successfully updated task: ${taskId}`);
            return { taskId, wasCreated: false };
        } else {
            // Task doesn't exist, create it
                console.log(`Creating new task for quote: ${quote.id}`);
            const createResult = await this.createQuoteTask(quote);
            const taskId = createResult.data[0].id;
                console.log(`Successfully created task: ${taskId}`);
            return { taskId, wasCreated: true };
            }
        } catch (error) {
            console.error(`Error in createOrUpdateQuoteTask for quote ${quote.id}:`, error);
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
            console.error('Error creating quote task description:', error);
            // Fallback to a simple description if there's an error
            return `<h2>📋 Quote Information</h2><p><strong>Quote ID:</strong> ${this.escapeHtml(quote.id)}</p><p><strong>Title:</strong> ${this.escapeHtml(quote.title)}</p>`;
        }
    }

    /**
     * Creates an HTML table for quote line items
     * 
     * TODO: Figure out why the table is not displaying correctly in Wrike. Not all rows are being displayed. Weirdly around the 6th or 7th row
     */
    private createQuoteLineItemsTable(quote: ShopVoxQuote): string {
        if (!quote.lineItems || quote.lineItems.length === 0) {
            return '<h2>📦 Line Items</h2><p>No line items</p>';
        }

        try {
            const tableRows = quote.lineItems.map((item, index) => {
                const description = item?.fullDescription ? this.cleanHtmlTags(item.fullDescription) : '';
                const displayDescription = description || 'No description';
                
                return `
<tr>
    <td style="font-weight: bold;">${this.escapeHtml(item?.name || 'Unnamed Item')}</td>
    <td style="max-width: 200px; word-wrap: break-word;">${this.escapeHtml(displayDescription)}</td>
    <td style="text-align: center;">${item?.quantity || 0}</td>
</tr>`;
            }).join('');

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
            console.error('Error processing line items table:', error);
            return '<h2>📦 Line Items</h2><p>Error processing line items</p>';
        }
    }

}

// Export a singleton instance
export const wrikeService = new WrikeService();
