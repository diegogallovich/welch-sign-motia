import { EventConfig, FlowContext } from "motia";
import { z } from "zod";
import { wrikeService } from "../../services/wrike.service";

const SubtaskCreatedInputSchema = z.object({
  subtaskId: z.string(),
  parentTaskId: z.string(),
});

export const config: EventConfig = {
  type: "event",
  name: "process-subtask-created",
  description:
    "Copies custom fields from parent task to subtask and sets subtask name to match parent",
  subscribes: ["subtask:created"],
  emits: [],
  input: SubtaskCreatedInputSchema,
  flows: ["wrike-to-wrike"],
};

export const handler = async (
  input: z.infer<typeof SubtaskCreatedInputSchema>,
  { logger }: FlowContext
) => {
  const { subtaskId, parentTaskId } = input;

  logger.info(
    `Processing subtask created event for subtask ${subtaskId} with parent ${parentTaskId}`
  );

  try {
    // Fetch both parent task and subtask data in parallel
    const [parentTaskResult, subtaskResult] = await Promise.all([
      wrikeService.getTaskById(parentTaskId),
      wrikeService.getTaskById(subtaskId),
    ]);

    if (parentTaskResult.data.length === 0) {
      logger.error(`Parent task not found in Wrike for ID ${parentTaskId}`);
      return;
    }

    if (subtaskResult.data.length === 0) {
      logger.error(`Subtask not found in Wrike for ID ${subtaskId}`);
      return;
    }

    const parentTask = parentTaskResult.data[0];
    const subtask = subtaskResult.data[0];

    logger.info(`Parent task title: ${parentTask.title}`);
    logger.info(`Subtask title: ${subtask.title}`);

    // Check if subtask title already matches parent task name (idempotency check)
    if (subtask.title === parentTask.title) {
      logger.info(
        `Subtask title already matches parent name, skipping update for subtask ${subtaskId}`
      );
      return;
    }

    // Set subtask title to match parent task name
    const newSubtaskTitle = parentTask.title;

    // Get parent task's custom fields
    const parentCustomFields = parentTask.customFields || [];

    logger.info(
      `Copying ${parentCustomFields.length} custom fields from parent to subtask`
    );
    logger.info(`Setting subtask title to parent name: ${newSubtaskTitle}`);

    // Update the subtask with parent's data (title and custom fields only, not description)
    await wrikeService.updateSubtask(
      subtaskId,
      newSubtaskTitle,
      undefined,
      parentCustomFields
    );

    logger.info(`Successfully updated subtask ${subtaskId}`);
  } catch (error) {
    logger.error(
      `Error processing subtask created event: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
};
