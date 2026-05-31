"use strict";

const { Logger } = require("@aws-lambda-powertools/logger");
const { Metrics } = require("@aws-lambda-powertools/metrics");
const { Tracer, captureLambdaHandler } = require("@aws-lambda-powertools/tracer");
const { createTask } = require("../../shared/db");

const logger = new Logger({ serviceName: "TaskManager" });
const metrics = new Metrics({ namespace: "TaskManager" });
const tracer = new Tracer({ serviceName: "TaskManager" });

/**
 * POST /tasks
 * Creates a new task for the authenticated user
 */
exports.handler = captureLambdaHandler(async (event) => {
  const segment = tracer.getSegment();
  const subsegment = segment.addNewSubsegment("## createTaskHandler");

  try {
    // Extract user ID from Cognito JWT claims
    const userId = event.requestContext.authorizer.jwt.claims.sub;
    logger.info("Create task request", { userId });

    // Parse and validate request body
    if (!event.body) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Request body is required" }),
      };
    }

    let body;
    try {
      body = JSON.parse(event.body);
    } catch {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Invalid JSON in request body" }),
      };
    }

    // Validate required fields
    if (!body.title || typeof body.title !== "string" || body.title.trim().length === 0) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "title is required and must be a non-empty string" }),
      };
    }

    if (body.title.length > 200) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "title must not exceed 200 characters" }),
      };
    }

    const validStatuses = ["todo", "in_progress", "done"];
    if (body.status && !validStatuses.includes(body.status)) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
        }),
      };
    }

    const validPriorities = ["low", "medium", "high", "critical"];
    if (body.priority && !validPriorities.includes(body.priority)) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: `Invalid priority. Must be one of: ${validPriorities.join(", ")}`,
        }),
      };
    }

    // Create task
    const task = await createTask(userId, {
      title: body.title.trim(),
      description: body.description?.trim() || "",
      status: body.status || "todo",
      priority: body.priority || "medium",
    });

    logger.info("Task created successfully", { taskId: task.id, userId });
    metrics.addMetric("TaskCreated", 1, "Count");

    return {
      statusCode: 201,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(task),
    };
  } catch (error) {
    logger.error("Failed to create task", { error: error.message, userId: event.requestContext?.authorizer?.jwt?.claims?.sub });

    return {
      statusCode: error.statusCode || 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: error.message || "Internal server error",
        requestId: event.requestContext?.requestId,
      }),
    };
  } finally {
    subsegment.close();
  }
});