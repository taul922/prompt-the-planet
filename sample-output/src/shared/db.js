"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
} = require("@aws-sdk/lib-dynamodb");
const { Logger } = require("@aws-lambda-powertools/logger");
const { Metrics, MetricUnit } = require("@aws-lambda-powertools/metrics");
const { Tracer } = require("@aws-lambda-powertools/tracer");

const logger = new Logger({ serviceName: "TaskManager" });
const metrics = new Metrics({ namespace: "TaskManager" });
const tracer = new Tracer({ serviceName: "TaskManager" });

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

// Enable X-Ray tracing on DynamoDB clients
tracer.captureAWSv3Client(client);
tracer.captureAWSv3Client(docClient);

const TABLE_NAME = process.env.TASKS_TABLE;

/**
 * Generates a v4 UUID
 */
function generateId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Creates a task item for DynamoDB Single Table Design
 * PK: USER#<userId>
 * SK: TASK#<taskId>
 * GSI1PK: TASK#STATUS#<status>
 * GSI1SK: TASK#<createdAt>
 */
function buildTaskItem(userId, taskId, data) {
  const now = new Date().toISOString();
  return {
    pk: `USER#${userId}`,
    sk: `TASK#${taskId}`,
    gsi1pk: `TASK#STATUS#${data.status || "todo"}`,
    gsi1sk: `TASK#${now}`,
    entityType: "TASK",
    id: taskId,
    userId,
    title: data.title,
    description: data.description || "",
    status: data.status || "todo",
    priority: data.priority || "medium",
    createdAt: now,
    updatedAt: now,
    ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60, // 90 days TTL
  };
}

/**
 * Creates a new task in DynamoDB
 */
async function createTask(userId, data) {
  const taskId = generateId();
  const item = buildTaskItem(userId, taskId, data);

  logger.info("Creating task", { taskId, userId });

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
      ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)",
    })
  );

  metrics.addMetric("TaskCreated", MetricUnit.Count, 1);
  return item;
}

/**
 * Gets a task by ID for a specific user
 */
async function getTask(userId, taskId) {
  logger.info("Getting task", { taskId, userId });

  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: `USER#${userId}`,
        sk: `TASK#${taskId}`,
      },
    })
  );

  if (!result.Item) {
    const error = new Error("Task not found");
    error.statusCode = 404;
    throw error;
  }

  return result.Item;
}

/**
 * Lists all tasks for a user, optionally filtered by status
 */
async function listTasks(userId, status) {
  logger.info("Listing tasks", { userId, status });

  if (status) {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "gsi1",
        KeyConditionExpression: "gsi1pk = :pk",
        FilterExpression: "userId = :userId",
        ExpressionAttributeValues: {
          ":pk": `TASK#STATUS#${status}`,
          ":userId": userId,
        },
      })
    );
    return result.Items || [];
  }

  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": `USER#${userId}`,
        ":skPrefix": "TASK#",
      },
    })
  );

  return result.Items || [];
}

/**
 * Updates an existing task
 */
async function updateTask(userId, taskId, data) {
  logger.info("Updating task", { taskId, userId, data });

  // First check the task exists
  const existing = await getTask(userId, taskId);

  const now = new Date().toISOString();
  const updateFields = [];
  const expressionAttributeValues = {
    ":now": now,
  };
  const expressionAttributeNames = {};

  if (data.title !== undefined) {
    updateFields.push("#title = :title");
    expressionAttributeValues[":title"] = data.title;
    expressionAttributeNames["#title"] = "title";
  }
  if (data.description !== undefined) {
    updateFields.push("#desc = :desc");
    expressionAttributeValues[":desc"] = data.description;
    expressionAttributeNames["#desc"] = "description";
  }
  if (data.status !== undefined) {
    updateFields.push("#status = :status");
    expressionAttributeValues[":status"] = data.status;
    expressionAttributeNames["#status"] = "status";
    // Also update GSI1PK since status is part of the GSI key
    updateFields.push("gsi1pk = :gsi1pk");
    expressionAttributeValues[":gsi1pk"] = `TASK#STATUS#${data.status}`;
  }
  if (data.priority !== undefined) {
    updateFields.push("#priority = :priority");
    expressionAttributeValues[":priority"] = data.priority;
    expressionAttributeNames["#priority"] = "priority";
  }

  updateFields.push("updatedAt = :now");

  const updateExpression = `SET ${updateFields.join(", ")}`;

  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: `USER#${userId}`,
        sk: `TASK#${taskId}`,
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames:
        Object.keys(expressionAttributeNames).length > 0
          ? expressionAttributeNames
          : undefined,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "ALL_NEW",
      ConditionExpression: "attribute_exists(pk) AND attribute_exists(sk)",
    })
  );

  metrics.addMetric("TaskUpdated", MetricUnit.Count, 1);
  return { ...existing, ...data, updatedAt: now };
}

/**
 * Deletes a task
 */
async function deleteTask(userId, taskId) {
  logger.info("Deleting task", { taskId, userId });

  await docClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: `USER#${userId}`,
        sk: `TASK#${taskId}`,
      },
      ConditionExpression: "attribute_exists(pk) AND attribute_exists(sk)",
    })
  );

  metrics.addMetric("TaskDeleted", MetricUnit.Count, 1);
  return { message: "Task deleted successfully", id: taskId };
}

module.exports = {
  createTask,
  getTask,
  listTasks,
  updateTask,
  deleteTask,
  generateId,
};