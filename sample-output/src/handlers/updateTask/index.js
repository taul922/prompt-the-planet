"use strict";

const { Logger } = require("@aws-lambda-powertools/logger");
const { Metrics, MetricUnit } = require("@aws-lambda-powertools/metrics");
const { Tracer, captureLambdaHandler } = require("@aws-lambda-powertools/tracer");
const { updateTask } = require("../../shared/db");

const logger = new Logger({ serviceName: "TaskManager" });
const metrics = new Metrics({ namespace: "TaskManager" });
const tracer = new Tracer({ serviceName: "TaskManager" });

/**
 * PUT /tasks/{id}
 * Updates an existing task
 */
exports.handler = captureLambdaHandler(async (event, context) => {
  logger.addContext(context);

  try {
    const userId = event.requestContext.authorizer.jwt.claims.sub;
    const taskId = event.pathParameters?.id;

    tracer.putAnnotation("userId", userId);
    tracer.putAnnotation("taskId", taskId);
    tracer.putAnnotation("operation", "updateTask");

    if (!taskId) {
      metrics.addMetric("ValidationError", MetricUnit.Count, 1);
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Task ID is required" }),
      };
    }

    if (!event.body) {
      metrics.addMetric("ValidationError", MetricUnit.Count, 1);
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Request body is required" }),
      };
    }

    let body;
    try {
      body = JSON.parse(event.body);
    } catch {
      metrics.addMetric("ValidationError", MetricUnit.Count, 1);
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Invalid JSON in request body" }),
      };
    }

    // Validate at least one field to update
    if (Object.keys(body).length === 0) {
      metrics.addMetric("ValidationError", MetricUnit.Count, 1);
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "At least one field to update is required" }),
      };
    }

    // Validate fields if provided
    if (body.title !== undefined) {
      if (typeof body.title !== "string" || body.title.trim().length === 0) {
        metrics.addMetric("ValidationError", MetricUnit.Count, 1);
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({ error: "title must be a non-empty string" }),
        };
      }
      if (body.title.length > 200) {
        metrics.addMetric("ValidationError", MetricUnit.Count, 1);
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({ error: "title must not exceed 200 characters" }),
        };
      }
    }

    const validStatuses = ["todo", "in_progress", "done"];
    if (body.status !== undefined && !validStatuses.includes(body.status)) {
      metrics.addMetric("ValidationError", MetricUnit.Count, 1);
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
        }),
      };
    }

    const validPriorities = ["low", "medium", "high", "critical"];
    if (body.priority !== undefined && !validPriorities.includes(body.priority)) {
      metrics.addMetric("ValidationError", MetricUnit.Count, 1);
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          error: `Invalid priority. Must be one of: ${validPriorities.join(", ")}`,
        }),
      };
    }

    logger.info("Update task request", { taskId, userId, body });

    const updated = await updateTask(userId, taskId, {
      ...(body.title !== undefined && { title: body.title.trim() }),
      ...(body.description !== undefined && { description: body.description.trim() }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.priority !== undefined && { priority: body.priority }),
    });

    metrics.addMetric("TaskUpdated", MetricUnit.Count, 1);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(updated),
    };
  } catch (error) {
    logger.error("Failed to update task", { error: error.message, stack: error.stack });
    tracer.addErrorAsMetadata(error);

    if (error.message === "Task not found") {
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
