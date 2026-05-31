"use strict";

const { Logger } = require("@aws-lambda-powertools/logger");
const { Tracer, captureLambdaHandler } = require("@aws-lambda-powertools/tracer");
const { getTask } = require("../../shared/db");

const logger = new Logger({ serviceName: "TaskManager" });
const tracer = new Tracer({ serviceName: "TaskManager" });

/**
 * GET /tasks/{id}
 * Retrieves a single task by ID for the authenticated user
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

    logger.info("Get task request", { taskId, userId });
    const task = await getTask(userId, taskId);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(task),
    };
  } catch (error) {
    logger.error("Failed to get task", { error: error.message });

    if (error.message === "Task not found") {
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