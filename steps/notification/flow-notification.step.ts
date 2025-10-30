import { EventConfig, Handlers, FlowContext } from "motia";
import { z } from "zod";
import { mailgunService } from "../../services/mailgun.service";
import { getFlowState, clearFlowState } from "../../utils/state-logger";

// Define input schema for finality events
const FinalityEventSchema = z.object({
  traceId: z.string(),
  error: z
    .object({
      message: z.string(),
      stack: z.string().optional(),
      step: z.string().optional(),
    })
    .optional(),
  result: z.any().optional(),
  input: z.any().optional(),
});

/**
 * Derives a human-readable flow name from the step name
 */
function getFlowNameFromStep(stepName?: string): string {
  if (!stepName) return "Unknown Flow";

  // Map step names to flow names
  const flowMap: Record<string, string> = {
    "process-shopvox-quote-created": "ShopVox Quote → Wrike",
    "process-shopvox-quote-updated": "ShopVox Quote → Wrike",
    "process-shopvox-quote-destroyed": "ShopVox Quote → Wrike",
    "process-shopvox-work-order-created": "ShopVox Work Order → Wrike",
    "process-shopvox-work-order-updated": "ShopVox Work Order → Wrike",
    "process-shopvox-work-order-deleted": "ShopVox Work Order → Wrike",
    "process-wrike-woso-target-install-date-changed": "Wrike → ShopVox",
    "process-wrike-woso-user-field-changed":
      "Wrike User Field Update → ShopVox",
  };

  return flowMap[stepName] || "Motia Workflow";
}

/**
 * Extracts IDs from flow state for use in email subjects
 */
function extractFlowIds(flowState: any, stepName?: string) {
  const ids: { shopVoxId?: string; wrikeTaskId?: string; itemType?: string } =
    {};

  // Extract from data
  if (flowState.data?.shopvox) {
    ids.shopVoxId =
      flowState.data.shopvox.salesOrder?.id || flowState.data.shopvox.quote?.id;
    ids.itemType = flowState.data.shopvox.salesOrder ? "SO" : "Quote";
  }

  if (flowState.data?.wrike) {
    ids.wrikeTaskId =
      flowState.data.wrike.task?.taskId || flowState.data.wrike.taskId;
  }

  return ids;
}

export const config: EventConfig = {
  type: "event",
  name: "flow-notification-handler",
  description:
    "Handles flow completion and error notifications via email using Mailgun",
  subscribes: [
    // Success events
    "finality:quote-created-success",
    "finality:quote-updated-success",
    "finality:quote-destroyed-success",
    "finality:work-order-created-success",
    "finality:work-order-updated-success",
    "finality:work-order-destroyed-success",
    "finality:target-install-date-updated-success",
    "finality:user-field-updated-success",
    // Error events
    "finality:error:quote-created",
    "finality:error:quote-updated",
    "finality:error:quote-destroyed",
    "finality:error:work-order-created",
    "finality:error:work-order-updated",
    "finality:error:work-order-destroyed",
    "finality:error:target-install-date-updated",
    "finality:error:user-field-updated",
  ],
  emits: [],
  input: FinalityEventSchema,
  flows: ["shopvox-to-wrike", "wrike-to-shopvox"],
};

export const handler: Handlers["flow-notification-handler"] = async (
  input,
  { logger, state, traceId }: FlowContext
) => {
  logger.info("Processing flow finality notification", { traceId });

  try {
    // Retrieve all logs and data from state
    const flowState = await getFlowState(state, traceId);

    // Determine if this is an error or success
    const isError = !!input.error;

    // Get the step name from error or from first log entry
    let stepName = input.error?.step;
    if (!stepName && flowState.logs.length > 0) {
      // Extract step name from first log's metadata
      const firstLog = flowState.logs[0];
      stepName = firstLog.metadata?.step;
    }

    // Get the flow name from the step name
    const flowName = getFlowNameFromStep(stepName);

    // Extract IDs for unique email subjects
    const ids = extractFlowIds(flowState, stepName);

    const recipientEmail = "welchandbailey.motia@unclogflows.com";

    if (isError) {
      // Send error notification
      logger.info("Sending error notification email", { traceId });

      // Create unique subject based on flow direction
      let subject: string;
      if (stepName?.includes("wrike-woso")) {
        // Wrike to ShopVox flow
        subject = `Wrike-to-ShopVox: ${traceId.substring(0, 8)} - ${
          ids.wrikeTaskId || "N/A"
        } - ${ids.shopVoxId || "N/A"} - ERROR`;
      } else {
        // ShopVox to Wrike flow
        subject = `ShopVox-to-Wrike: ${traceId.substring(0, 8)} - ${
          ids.shopVoxId || "N/A"
        } - ${ids.wrikeTaskId || "N/A"} - ERROR`;
      }
      const htmlContent = mailgunService.formatErrorEmail(
        traceId,
        flowName,
        input.error,
        flowState.logs,
        flowState.data
      );

      await mailgunService.sendEmail({
        to: recipientEmail,
        subject,
        html: htmlContent,
      });

      logger.info("Error notification email sent successfully", { traceId });
    } else {
      // Send success notification
      logger.info("Sending success notification email", { traceId });

      // Create unique subject based on flow direction
      let subject: string;
      if (stepName?.includes("wrike-woso")) {
        // Wrike to ShopVox flow
        subject = `Wrike-to-ShopVox: ${traceId.substring(0, 8)} - ${
          ids.wrikeTaskId || "N/A"
        } - ${ids.shopVoxId || "N/A"}`;
      } else {
        // ShopVox to Wrike flow
        subject = `ShopVox-to-Wrike: ${traceId.substring(0, 8)} - ${
          ids.shopVoxId || "N/A"
        } - ${ids.wrikeTaskId || "N/A"}`;
      }
      const htmlContent = mailgunService.formatSuccessEmail(
        traceId,
        flowName,
        flowState.logs,
        flowState.data
      );

      await mailgunService.sendEmail({
        to: recipientEmail,
        subject,
        html: htmlContent,
      });

      logger.info("Success notification email sent successfully", { traceId });
    }

    // Optional: Clear state after notification to free memory
    await clearFlowState(state, traceId);
    logger.info("Flow state cleared", { traceId });
  } catch (error) {
    logger.error("Failed to send notification email", {
      traceId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    // Don't throw - we don't want notification failures to break the flow
  }
};
