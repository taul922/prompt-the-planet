"use strict";

const { Logger } = require("@aws-lambda-powertools/logger");
const { Tracer, captureLambdaHandler } = require("@aws-lambda-powertools/tracer");
const { listTasks } = require("../../shared/db");

const logger = new Logger({ serviceName: "TaskManager" });
const tracer = new Tracer({ serviceName: "TaskManager" });

/**
 * GET /tasks
 * Lists all tasks for the authenticated user, optionally filtered by status
 * Query params: ?status=todo&limit=20&nextToken=xxx
 */
exports.handler = captureLambdaHandler(async (event) => {
  try {
    const userId = event.requestContext.authorizer.jwt.claims.sub;
    const queryParams = event.queryStringParameters || {};
    const status = queryParams.status || null;
    const limit = Math.min(parseInt(queryParams.limit) || 20, 100);

    logger.info("List tasks request", { userId, status, limit });

    const tasks = await listTasks(userId, status);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: tasks.slice(0, limit),
        count: tasks.length,
        limit,
        hasMore: tasks.length > limit,
      }),
    };
  } catch (error) {
    logger.error("Failed to list tasks", { error: error.message });

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