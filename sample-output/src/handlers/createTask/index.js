"use strict";

const { Logger } = require("@aws-lambda-powertools/logger");
const { Metrics, MetricUnit, logMetrics } = require("@aws-lambda-powertools/metrics");
const { Tracer, captureLambdaHandler } = require("@aws-lambda-powertools/tracer");
const { createTask } = require("../../shared/db");

const logger = new Logger({ serviceName: "TaskManager" });
const metrics = new Metrics({ namespace: "TaskManager" });
const tracer = new Tracer({ serviceName: "TaskManager" });

/**
 * POST /tasks
 * Creates a new task for the authenticated user
 */
exports.handler = captureLambdaHandler(async (event, context) => {
  // Inject context into logger for structured logging
  logger.addContext(context);

  try {
    // Extract user ID from Cognito JWT claims
    const userId = event.requestContext.authorizer.jwt.claims.sub;
    logger.info("Create task request", { userId });

    // Add annotation to X-Ray trace for searchability
    tracer.putAnnotation("userId", userId);
    tracer.putAnnotation("operation", "createTask");

    // Parse and validate request body
    if (!event.body) {
      const response = {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Request body is required" }),
      };
      metrics.addMetric("ValidationError", MetricUnit.Count, 1);
      return response;
    }

    let body;
    try {
      body = JSON.parse(event.body);
    } catch {
      const response = {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Invalid JSON in request body" }),
      };
      metrics.addMetric("ValidationError", MetricUnit.Count, 1);
      return response;
    }

    // Validate required fields
    if (!body.title || typeof body.title !== "string" || body.title.trim().length === 0) {
      const response = {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "title is required and must be a non-empty string" }),
      };
      metrics.addMetric("ValidationError", MetricUnit.Count, 1);
      return response;
    }

    if (body.title.length > 200) {
      const response = {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "title must not exceed 200 characters" }),
      };
      metrics.addMetric("ValidationError", MetricUnit.Count, 1);
      return response;
    }

    const validStatuses = ["todo", "in_progress", "done"];
    if (body.status && !validStatuses.includes(body.status)) {
      const response = {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
        }),
      };
      metrics.addMetric("ValidationError", MetricUnit.Count, 1);
      return response;
    }

    const validPriorities = ["low", "medium", "high", "critical"];
    if (body.priority && !validPriorities.includes(body.priority)) {
      const response = {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: `Invalid priority. Must be one of: ${validPriorities.join(", ")}`,
        }),
      };
      metrics.addMetric("ValidationError", MetricUnit.Count, 1);
      return response;
    }

    // Create task
    const task = await createTask(userId, {
      title: body.title.trim(),
      description: body.description?.trim() || "",
      status: body.status || "todo",
      priority: body.priority || "medium",
    });

    logger.info("Task created successfully", { taskId: task.id, userId });
    metrics.addMetric("TaskCreated", MetricUnit.Count, 1);

    return {
      statusCode: 201,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(task),
    };
  } catch (error) {
    logger.error("Failed to create task", {
      error: error.message,
      stack: error.stack,
      userId: event.requestContext?.authorizer?.jwt?.claims?.sub,
    });
    tracer.addErrorAsMetadata(error);

    metrics.addMetric("HandlerError", MetricUnit.Count, 1);

    return {
      statusCode: error.statusCode || 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: error.message || "Internal server error",
        requestId: event.requestContext?.requestId,
      }),
    };
  }
});
