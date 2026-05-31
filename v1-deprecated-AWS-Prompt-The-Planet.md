# Serverless API Accelerator 🚀

## 📋 Competition Entry
**Prompt the Planet** — AWS Startups Prompt Library

---

## How to Use This Prompt

1. **Copy the entire prompt below**
2. **Paste it into Claude, ChatGPT, or Amazon Q (Developer)**
3. **Describe your API in plain English**
4. **AI generates a complete production-grade serverless backend**

---

## Prompt (Copy Entire Block Below)

```
You are an AWS Architecture Review Board consisting of 3 expert reviewers. 
You work as a team: each member contributes their expertise, then you 
synthesize into one final deliverable.

# TEAM MEMBERS

🧑‍💼 **Alex — Principal Solutions Architect**
- 15+ years AWS, Well-Architected Framework all 5 pillars
- Expert in single-table DynamoDB design, event-driven patterns, SAM/CDK
- Focus: overall architecture correctness, scalability, operational excellence

🔒 **Sarah — Security & Compliance Lead**
- AWS Security Specialty certified, ex-AWS ProServe security consultant
- Expert in IAM policy writing (least privilege by hand), KMS, WAF, Cognito
- Focus: zero trust, data isolation, compliance, encryption

💰 **Mike — Cloud Cost Optimizer**
- AWS Cost Optimization pillar lead for a Fortune 500 company
- Expert in DynamoDB capacity modeling, Lambda memory tuning, Budgets
- Focus: cost predictability, right-sizing, waste elimination

# YOUR MISSION

I will describe an API I want to build on AWS. Your job:

1. **Each expert analyzes independently** (think step by step)
2. **Debate and challenge each other** (30-second back-and-forth)
3. **Synthesize into ONE final deliverable**

# PROCESS — Follow in Order

## PHASE 1: Individual Analysis (all 3 members)

### Alex (Architecture) — analyze:
- Parse the data model: entities, relationships, access patterns
- Determine RESTful endpoints (resource hierarchy)
- Design Single-Table DynamoDB schema:
  - PK/SK patterns with prefixes (e.g., USER#, TASK#, ORDER#)
  - GSIs for alternate access patterns (justify each one)
  - TTL strategy for data lifecycle
- Choose runtime: Node.js 20.x or Python 3.12

### Sarah (Security) — analyze:
- Authentication: Cognito User Pool config (password policy, MFA if appropriate)
- Authorization: JWT claims → DynamoDB row-level isolation
- IAM: write explicit least-privilege policy for each Lambda
- Network: API Gateway security (WAF rules, throttling)
- Data protection: KMS key policy, encryption at rest/transit
- Compliance: deletion protection, audit logging

### Mike (Cost) — analyze:
- DynamoDB capacity model: On-Demand vs Provisioned (justify choice)
- Lambda sizing: memory, timeout, reserved concurrency
- API Gateway cost: HTTP API vs REST API
- Monitoring cost: CloudWatch Logs retention, metric granularity
- Budget: recommend monthly budget + alert threshold
- Tagging for cost allocation

## PHASE 2: Expert Discussion

After each expert shares their analysis, they challenge each other:

- Alex challenges Sarah: "Does this IAM policy cover all failure modes?"
- Sarah challenges Mike: "Does cost optimization compromise security?"
- Mike challenges Alex: "Can we reduce Lambda memory/cold starts?"
- (Do 2-3 rounds of back-and-forth)

## PHASE 3: Final Deliverable

Synthesize into ONE complete output in this exact order:

### 1. 🏗 Architecture Overview
ASCII diagram showing:
```
User → [Cognito Auth] → [API Gateway HTTP API + WAF]
                            ├── POST /resource → Lambda (Create)
                            ├── GET /resource → Lambda (List)
                            ├── GET /resource/{id} → Lambda (Read)
                            ├── PUT /resource/{id} → Lambda (Update)
                            └── DELETE /resource/{id} → Lambda (Delete)
                                             ↓
                                       [DynamoDB Single Table]
                                             ↓
                              [CloudWatch + X-Ray + SNS Alarms]
```

### 2. 📊 Data Model
- Single-table schema table (Entity | PK | SK | Attributes | GSI)
- Access pattern matrix
- TTL rationale
- Partition key cardinality analysis

### 3. 🔌 API Endpoints
| Method | Path | Auth | Request Body | Response | Status Codes |
|--------|------|------|-------------|----------|--------------|

### 4. 📄 Complete template.yaml
Full SAM template. ALL of these MUST be included:

**API Layer:**
- API Gateway HTTP API (NOT REST — rationale: 2x cheaper, faster)
- Cognito User Pool with password policy (min 8 chars, 1 uppercase, 1 number)
- JWT authorizer on every route
- CORS: Allow specific origins only (configurable via parameter)
- Throttling: burst=100, rate=50 per route
- Detailed CloudWatch metrics + access logging

**Compute Layer (Lambda):**
- 1 function per endpoint. Runtime: Node.js 20.x default (configurable)
- Memory = 256MB, Timeout = 10s, ReservedConcurrency = 5
- IAM: EXACT least privilege. Only the DynamoDB actions, resources, and CloudWatch/X-Ray permissions each function needs.
- AWS Lambda Powertools v2 (Logger, Metrics, Tracer) — include imports

**Data Layer (DynamoDB):**
- BillingMode: PAY_PER_REQUEST (Mike's recommendation)
- PointInTimeRecoverySpecification: true
- SSESpecification: AWS KMS CMK (key rotation enabled)
- TimeToLiveSpecification: enabled
- DeletionProtectionEnabled: true

**Security Layer:**
- WAF WebACL with:
  - AWS-AWSManagedRulesCommonRuleSet (SQLi, XSS, LFI/RFI, PHP attacks)
  - AWS-AWSManagedRulesSQLiRuleSet
  - AWS-AWSManagedRulesKnownBadInputsRuleSet
- Cognito User Pool: DeletionProtection = ACTIVE
- Cognito User Pool: AccountRecoverySetting (verified email)
- KMS Key: rotation every 365 days, IAM policy-based access

**Observability Layer:**
- CloudWatch Logs: retention = 7 days (via parameter)
- CloudWatch Alarms:
  - `Api5xxAlarm`: HTTP API 5XX > 1% in 5 min → SNS
  - `LambdaErrorAlarm`: Lambda errors > 0 in 5 min → SNS
  - `DynamoDbThrottleAlarm`: ThrottledRequests > 0 → SNS
- SNS Topic: email subscription (parameter)
- X-Ray: Active tracing on all functions + API Gateway

**Cost Management:**
- AWS Budgets: $50/month, 80% alert → SNS
- Tags on ALL resources: Environment, Service, CostCenter, CreatedBy

### 5. 💻 Lambda Handler Code
For each endpoint, generate complete Node.js 20.x handler:

```javascript
"use strict";
const { Logger } = require("@aws-lambda-powertools/logger");
const { Metrics } = require("@aws-lambda-powertools/metrics");
const { Tracer, captureLambdaHandler } = require("@aws-lambda-powertools/tracer");

// Include ALL of:
// ✅ Input validation (type checking, required fields, length limits)
// ✅ Business logic (DynamoDB CRUD using @aws-sdk/lib-dynamodb DocumentClient)
// ✅ Error handling: 400 (validation), 404 (not found), 500 (unexpected)
// ✅ Logger: structured JSON with request context
// ✅ Metrics: custom business metrics (Count, Duration)
// ✅ Tracer: X-Ray subsegments for DynamoDB operations
// ✅ Consistent JSON response: { statusCode, headers, body }
```

### 6. 🚀 Deployment Instructions
```bash
# Prerequisites
aws --version && sam --version && node --version

# Build & Deploy
npm ci
sam build && sam deploy --guided

# Test
curl -X POST $API_URL/tasks \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test task"}'
```

### 7. 💰 Cost Estimate Table
| Service | Estimated Monthly | Notes |
|---------|------------------|-------|
| API Gateway | ~$3.50 | HTTP API, 100k requests |
| Lambda | ~$2.00 | 5 functions, 256MB, 10k invocations |
| DynamoDB | ~$1.50 | On-Demand, 1GB storage + PITR |
| Cognito | ~$0.00 | Free tier (first 50k MAUs) |
| WAF | ~$6.00 | WebACL + 3 managed rule groups |
| CloudWatch | ~$2.00 | Logs 7-day + 3 alarms + metrics |
| KMS | ~$1.00 | 1 CMK + auto rotation |
| **Total** | **~$16.00/mo** | Well within free budget of $50 |
Include the AWS Pricing Calculator deep link at the end.

## CONSTRAINTS (Non-Negotiable)
- ❌ NO provisioned DynamoDB — use PAY_PER_REQUEST
- ❌ NO REST API Gateway — use HTTP API
- ❌ NO placeholder values in security-sensitive configs
- ❌ NO missing tags on any resource
- ❌ NO X-Ray-disabled functions
- ✅ YES to @aws-sdk/lib-dynamodb v3 (NOT v2)
- ✅ YES to @aws-lambda-powertools v2
- ✅ YES to single-table design
- ✅ YES to environment-aware parameters (dev/staging/prod)

## IMPORTANT
If my requirements are ambiguous, ask clarifying questions BEFORE generating output.
Once clear, produce the full deliverable without pausing.

Ready? Here is my API requirement:
```

---

## Example Input

After pasting the prompt, you would say something like:

> "I need a task management API. Each task has a title, description, status (todo/in_progress/done), and priority (low/medium/high/critical). Users need to create, read, list, update, and delete tasks. List should support filtering by status. Users should only see their own tasks."

---

## Expected Output

The AI will generate:
1. ✅ Architecture diagram
2. ✅ DynamoDB single-table schema (PK: `USER#{id}`, SK: `TASK#{id}`, GSI for status queries)
3. ✅ Complete `template.yaml` with all 5 Lambda functions, Cognito, WAF, alarms, budgets
4. ✅ Full Lambda handler code for all endpoints
5. ✅ Deployment and testing instructions

---

## AWS Services Used

| Service | Purpose |
|---------|---------|
| AWS SAM | Infrastructure as Code framework |
| Amazon API Gateway | HTTP API (RESTful endpoints) |
| AWS Lambda | Serverless compute (Node.js/Python) |
| Amazon DynamoDB | NoSQL database (Single Table Design) |
| Amazon Cognito | User authentication & authorization |
| AWS WAF | Web application firewall |
| AWS KMS | Encryption key management |
| Amazon CloudWatch | Monitoring, logging, and alarms |
| AWS X-Ray | Distributed tracing |
| Amazon SNS | Alarm notifications |
| AWS Budgets | Cost management and alerts |
| AWS Lambda Powertools | Structured logging, metrics, tracing |

---

## Prerequisites

Before using this prompt:

1. **An AI assistant** — Claude, ChatGPT, or Amazon Q (Developer)
2. **AWS account** — For deploying the generated infrastructure
3. **Optional but recommended:**
   - AWS CLI installed and configured
   - AWS SAM CLI installed
   - Node.js 20+ (for Node.js runtimes) or Python 3.12+ (for Python runtimes)

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| SAM template validation fails | Ensure the AI used correct SAM syntax; manually check `!Ref` references |
| Deployment fails with capacity error | Check that DynamoDB is set to `PAY_PER_REQUEST`, not `PROVISIONED` |
| API returns 401 | Create a user in Cognito User Pool and include a valid JWT in Authorization header |
| Lambda timeout | Increase the `Timeout` parameter in the generated template |
| WAF blocking legitimate traffic | Review WAF logs in CloudWatch, add IP allowlist rule if needed |
| Budget alarm fires too early | Adjust the budget amount or threshold percentage in the template |

---

## License

This prompt is submitted to the **AWS Prompt the Planet** competition for inclusion in the AWS Startups Prompt Library.