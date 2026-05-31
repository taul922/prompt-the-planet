"use strict";

const { Logger } = require("@aws-lambda-powertools/logger");
const { Metrics } = require("@aws-lambda-powertools/metrics");
const { Tracer, captureLambdaHandler } = require("@aws-lambda-powertools/tracer");
const { deleteTask } = require("../../shared/db");

const logger = new Logger({ serviceName: "TaskManager" });
const metrics = new Metrics({ namespace: "TaskManager" });
const tracer = new Tracer({ serviceName: "TaskManager" });

/**
 * DELETE /tasks/{id}
 * Deletes a task for the authenticated user
 */
exports.handler = captureLambdaHandler(async (event) => {
  try {
    const userId = event.requestContext.authorizer.jwt.claims.sub;
    const taskId = event.pathParameters?.id;

    if (!taskId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Task ID is required" }),
      };
    }

    logger.info("Delete task request", { taskId, userId });
    const result = await deleteTask(userId, taskId);

    metrics.addMetric("TaskDeleted", 1, "Count");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    };
  } catch (error) {
    logger.error("Failed to delete task", { error: error.message });

    if (error.message.includes("ConditionalCheckFailed")) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Task not found" }),
      };
    }

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Internal server error",
        requestId: event.requestContext?.requestId,
      }),
    };
  }
});