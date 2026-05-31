"use strict";

const { Logger } = require("@aws-lambda-powertools/logger");
const { Metrics, MetricUnit } = require("@aws-lambda-powertools/metrics");
const { Tracer, captureLambdaHandler } = require("@aws-lambda-powertools/tracer");
const { deleteTask } = require("../../shared/db");

const logger = new Logger({ serviceName: "TaskManager" });
const metrics = new Metrics({ namespace: "TaskManager" });
const tracer = new Tracer({ serviceName: "TaskManager" });

/**
 * DELETE /tasks/{id}
 * Deletes a task for the authenticated user
 */
exports.handler = captureLambdaHandler(async (event, context) => {
  logger.addContext(context);

  try {
    const userId = event.requestContext.authorizer.jwt.claims.sub;
    const taskId = event.pathParameters?.id;

    tracer.putAnnotation("userId", userId);
    tracer.putAnnotation("taskId", taskId);
    tracer.putAnnotation("operation", "deleteTask");

    if (!taskId) {
      metrics.addMetric("ValidationError", MetricUnit.Count, 1);
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Task ID is required" }),
      };
    }

    logger.info("Delete task request", { taskId, userId });
    const result = await deleteTask(userId, taskId);

    metrics.addMetric("TaskDeleted", MetricUnit.Count, 1);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(result),
    };
  } catch (error) {
    logger.error("Failed to delete task", { error: error.message, stack: error.stack });
    tracer.addErrorAsMetadata(error);

    if (error.message.includes("ConditionalCheckFailed")) {
      metrics.addMetric("TaskNotFound", MetricUnit.Count, 1);
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Task not found" }),
      };
    }

    metrics.addMetric("HandlerError", MetricUnit.Count, 1);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        error: "Internal server error",
        requestId: event.requestContext?.requestId,
      }),
    };
  }
});
