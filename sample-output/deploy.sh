#!/bin/bash
set -euo pipefail

# ============================================================================
# Serverless API Accelerator - Deployment Script
# ============================================================================
# Usage:
#   ./deploy.sh                    # Deploy to prod
#   ./deploy.sh dev                # Deploy to dev
#   ./deploy.sh staging            # Deploy to staging
#   ./deploy.sh prod --guided      # First-time deployment with guided wizard
# ============================================================================

ENVIRONMENT="${1:-prod}"
STACK_NAME="prompt-the-planet-taskmanager-${ENVIRONMENT}"
AWS_REGION="${AWS_REGION:-us-east-1}"
SAM_BUCKET="${SAM_BUCKET:-}"
GUIDED="${2:-}"

echo "🚀 Deploying Serverless API to ${ENVIRONMENT}..."
echo "   Stack: ${STACK_NAME}"
echo "   Region: ${AWS_REGION}"
echo ""

# Check prerequisites
command -v aws >/dev/null 2>&1 || { echo "❌ AWS CLI is required. Install: https://aws.amazon.com/cli/"; exit 1; }
command -v sam >/dev/null 2>&1 || { echo "❌ AWS SAM CLI is required. Install: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required."; exit 1; }

# Verify AWS credentials
echo "🔑 Checking AWS credentials..."
aws sts get-caller-identity --output json >/dev/null 2>&1 || {
  echo "❌ AWS credentials not configured. Run 'aws configure' first."
  exit 1
}
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "   Account: ${ACCOUNT_ID}"

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Build SAM application
echo "🔨 Building SAM application..."
sam build

# Deploy
if [ "${GUIDED}" = "--guided" ]; then
  echo "🎯 Running guided deployment..."
  sam deploy --guided \
    --stack-name "${STACK_NAME}" \
    --region "${AWS_REGION}"
elif [ -n "${SAM_BUCKET}" ]; then
  echo "🎯 Deploying with S3 bucket: ${SAM_BUCKET}..."
  sam deploy \
    --stack-name "${STACK_NAME}" \
    --s3-bucket "${SAM_BUCKET}" \
    --s3-prefix "sam-deployments" \
    --region "${AWS_REGION}" \
    --no-fail-on-empty-changeset \
    --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
    --parameter-overrides \
      EnvironmentName="${ENVIRONMENT}" \
      LogRetentionDays=7
else
  echo "🎯 Deploying (S3 bucket will be auto-created)..."
  sam deploy \
    --stack-name "${STACK_NAME}" \
    --s3-prefix "sam-deployments" \
    --region "${AWS_REGION}" \
    --no-fail-on-empty-changeset \
    --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
    --parameter-overrides \
      EnvironmentName="${ENVIRONMENT}" \
      LogRetentionDays=7
fi

# Show outputs
echo ""
echo "✅ Deployment complete!"
echo "   Stack: ${STACK_NAME}"
echo ""
echo "📋 Stack Outputs:"
aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --query 'Stacks[0].Outputs' \
  --region "${AWS_REGION}" \
  --output table