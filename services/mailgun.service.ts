interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

class MailgunService {
  private domain: string;
  private apiKey: string;
  private fromEmail: string;

  constructor() {
    this.domain = process.env.MAILGUN_DOMAIN || "";
    this.apiKey = process.env.MAILGUN_API_KEY || "";
    this.fromEmail = process.env.MAILGUN_FROM_EMAIL || "";

    if (!this.domain || !this.apiKey || !this.fromEmail) {
      console.warn(
        "Mailgun credentials not fully configured. Email notifications will not work."
      );
    }
  }

  async sendEmail({ to, subject, html }: EmailOptions): Promise<void> {
    if (!this.domain || !this.apiKey || !this.fromEmail) {
      throw new Error(
        "Mailgun not configured. Set MAILGUN_DOMAIN, MAILGUN_API_KEY, and MAILGUN_FROM_EMAIL environment variables."
      );
    }

    const formData = new URLSearchParams();
    formData.append("from", this.fromEmail);
    formData.append("to", to);
    formData.append("subject", subject);
    formData.append("html", html);

    const url = `https://api.mailgun.net/v3/${this.domain}/messages`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`api:${this.apiKey}`).toString(
            "base64"
          )}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
        // Add timeout to fail faster
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Mailgun API error (${response.status}): ${errorText}`);
      }

      await response.json();
    } catch (error) {
      if (error instanceof Error) {
        // Provide more helpful error messages
        if (
          error.message.includes("fetch failed") ||
          error.message.includes("ECONNREFUSED")
        ) {
          throw new Error(
            `Cannot connect to Mailgun API at ${url}. ` +
              `Please check: 1) Network connectivity, 2) Mailgun domain is correct (should be like 'mg.yourdomain.com' or 'sandbox123.mailgun.org'), ` +
              `3) Firewall is not blocking the connection. Original error: ${error.message}`
          );
        }

        if (error.message.includes("timeout")) {
          throw new Error(
            `Mailgun API request timed out after 30 seconds. ` +
              `Please check your network connection and Mailgun service status. ` +
              `Domain: ${this.domain}`
          );
        }
      }
      throw error;
    }
  }

  formatSuccessEmail(
    traceId: string,
    flowName: string,
    logs: any[],
    data: any
  ): string {
    // Extract IDs for prominent display
    const shopVoxId = data?.shopvox?.salesOrder?.id || data?.shopvox?.quote?.id;
    const wrikeTaskId = data?.wrike?.task?.taskId || data?.wrike?.taskId;
    const itemType = data?.shopvox?.salesOrder ? "Sales Order" : "Quote";

    // Create ID section HTML
    const idSectionHtml =
      shopVoxId || wrikeTaskId
        ? `
      <div style="background: #d4edda; padding: 15px; border-radius: 6px; margin-bottom: 15px; border-left: 4px solid #28a745;">
        ${
          wrikeTaskId
            ? `<p style="margin: 5px 0; font-family: 'Courier New', monospace; font-size: 14px;"><strong>Wrike Task ID:</strong> <span style="color: #155724;">${wrikeTaskId}</span></p>`
            : ""
        }
        ${
          shopVoxId
            ? `<p style="margin: 5px 0; font-family: 'Courier New', monospace; font-size: 14px;"><strong>ShopVox ${itemType} ID:</strong> <span style="color: #155724;">${shopVoxId}</span></p>`
            : ""
        }
      </div>
    `
        : "";

    const logsHtml = logs
      .map(
        (log) => `
        <div style="margin: 8px 0; padding: 8px; background: #f8f9fa; border-left: 3px solid #28a745; font-family: 'Courier New', monospace; font-size: 13px;">
          <div style="color: #6c757d; font-size: 11px;">${log.timestamp}</div>
          <div><strong>${log.level.toUpperCase()}:</strong> ${log.message}</div>
          ${
            log.metadata
              ? `<pre style="margin: 4px 0 0 0; color: #495057;">${JSON.stringify(
                  log.metadata,
                  null,
                  2
                )}</pre>`
              : ""
          }
        </div>
      `
      )
      .join("");

    const dataHtml =
      Object.keys(data).length > 0
        ? `
      <div style="margin-top: 20px;">
        <h3 style="color: #495057; border-bottom: 2px solid #28a745; padding-bottom: 8px;">Flow Data</h3>
        <pre style="background: #f8f9fa; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 12px;">${JSON.stringify(
          data,
          null,
          2
        )}</pre>
      </div>
    `
        : "";

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="margin: 0; font-size: 28px;">✅ ${flowName}</h1>
          <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Completed Successfully</p>
        </div>
        
        <div style="background: white; padding: 30px; border: 1px solid #dee2e6; border-top: none; border-radius: 0 0 8px 8px;">
          <div style="background: #e7f5ec; padding: 15px; border-radius: 6px; margin-bottom: 15px;">
            <p style="margin: 0; font-family: 'Courier New', monospace; font-size: 13px;"><strong>Trace ID:</strong> ${traceId}</p>
          </div>

          ${idSectionHtml}

          <h3 style="color: #495057; border-bottom: 2px solid #28a745; padding-bottom: 8px;">Execution Logs</h3>
          ${logsHtml}

          ${dataHtml}
        </div>

        <div style="text-align: center; margin-top: 20px; padding: 15px; color: #6c757d; font-size: 12px;">
          <p>This is an automated notification from Motia Flow Monitoring</p>
        </div>
      </body>
      </html>
    `;
  }

  formatErrorEmail(
    traceId: string,
    flowName: string,
    error: any,
    logs: any[],
    data: any
  ): string {
    // Extract IDs for prominent display
    const shopVoxId = data?.shopvox?.salesOrder?.id || data?.shopvox?.quote?.id;
    const wrikeTaskId = data?.wrike?.task?.taskId || data?.wrike?.taskId;
    const itemType = data?.shopvox?.salesOrder ? "Sales Order" : "Quote";

    // Create ID section HTML
    const idSectionHtml =
      shopVoxId || wrikeTaskId
        ? `
      <div style="background: #f8d7da; padding: 15px; border-radius: 6px; margin-bottom: 15px; border-left: 4px solid #dc3545;">
        ${
          wrikeTaskId
            ? `<p style="margin: 5px 0; font-family: 'Courier New', monospace; font-size: 14px;"><strong>Wrike Task ID:</strong> <span style="color: #721c24;">${wrikeTaskId}</span></p>`
            : ""
        }
        ${
          shopVoxId
            ? `<p style="margin: 5px 0; font-family: 'Courier New', monospace; font-size: 14px;"><strong>ShopVox ${itemType} ID:</strong> <span style="color: #721c24;">${shopVoxId}</span></p>`
            : ""
        }
      </div>
    `
        : "";

    const logsHtml = logs
      .map((log) => {
        const isError = log.level === "error";
        const borderColor = isError ? "#dc3545" : "#6c757d";
        const bgColor = isError ? "#f8d7da" : "#f8f9fa";

        return `
        <div style="margin: 8px 0; padding: 8px; background: ${bgColor}; border-left: 3px solid ${borderColor}; font-family: 'Courier New', monospace; font-size: 13px;">
          <div style="color: #6c757d; font-size: 11px;">${log.timestamp}</div>
          <div><strong style="color: ${
            isError ? "#dc3545" : "#333"
          };">${log.level.toUpperCase()}:</strong> ${log.message}</div>
          ${
            log.metadata
              ? `<pre style="margin: 4px 0 0 0; color: #495057; max-height: 300px; overflow-y: auto;">${JSON.stringify(
                  log.metadata,
                  null,
                  2
                )}</pre>`
              : ""
          }
        </div>
      `;
      })
      .join("");

    const errorDetailsHtml = `
      <div style="background: #f8d7da; padding: 15px; border-radius: 6px; border-left: 4px solid #dc3545; margin: 20px 0;">
        <h4 style="color: #721c24; margin-top: 0;">Error Details</h4>
        <p style="margin: 8px 0;"><strong>Message:</strong> ${
          error.message || "Unknown error"
        }</p>
        ${
          error.step
            ? `<p style="margin: 8px 0;"><strong>Failed Step:</strong> ${error.step}</p>`
            : ""
        }
        ${
          error.stack
            ? `<details style="margin-top: 12px;"><summary style="cursor: pointer; color: #721c24; font-weight: bold;">Stack Trace</summary><pre style="background: white; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 11px; margin-top: 8px;">${error.stack}</pre></details>`
            : ""
        }
      </div>
    `;

    const dataHtml =
      Object.keys(data).length > 0
        ? `
      <div style="margin-top: 20px;">
        <h3 style="color: #495057; border-bottom: 2px solid #dc3545; padding-bottom: 8px;">Flow Data (for debugging)</h3>
        <pre style="background: #f8f9fa; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 12px; max-height: 400px; overflow-y: auto;">${JSON.stringify(
          data,
          null,
          2
        )}</pre>
      </div>
    `
        : "";

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="margin: 0; font-size: 28px;">🚨 ${flowName}</h1>
          <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Error Detected</p>
        </div>
        
        <div style="background: white; padding: 30px; border: 1px solid #dee2e6; border-top: none; border-radius: 0 0 8px 8px;">
          <div style="background: #fff3cd; padding: 15px; border-radius: 6px; margin-bottom: 15px; border-left: 4px solid #ffc107;">
            <p style="margin: 0; font-family: 'Courier New', monospace; font-size: 13px;"><strong>Trace ID:</strong> ${traceId}</p>
          </div>

          ${idSectionHtml}

          ${errorDetailsHtml}

          <h3 style="color: #495057; border-bottom: 2px solid #dc3545; padding-bottom: 8px; margin-top: 30px;">Execution Logs</h3>
          ${logsHtml}

          ${dataHtml}
        </div>

        <div style="text-align: center; margin-top: 20px; padding: 15px; color: #6c757d; font-size: 12px;">
          <p>This is an automated error notification from Motia Flow Monitoring</p>
          <p style="margin-top: 8px;">Use the Trace ID above to search logs for more details</p>
        </div>
      </body>
      </html>
    `;
  }
}

export const mailgunService = new MailgunService();
