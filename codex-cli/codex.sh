#!/bin/bash

# Get the actual script location, following symlinks
SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(dirname "$SCRIPT_PATH")"

echo "Script directory: $SCRIPT_DIR"

# Unset OpenAI API key to ensure we use Azure OpenAI
unset OPENAI_API_KEY
echo "Unset OPENAI_API_KEY"

# Set Azure OpenAI environment variables
export AZURE_OPENAI_API_VERSION=2024-08-01-preview
export AZURE_OPENAI_ENDPOINT=https://mlx-dealcloud-eastus-dev-localauth.openai.azure.com
export AZURE_OPENAI_API_KEY=14571f1215424ba4a083c155e1f1c411
export AZURE_OPENAI_DEPLOYMENT=o4-mini

echo "Set Azure OpenAI environment variables:"
echo "AZURE_OPENAI_API_VERSION=$AZURE_OPENAI_API_VERSION"
echo "AZURE_OPENAI_ENDPOINT=$AZURE_OPENAI_ENDPOINT"
echo "AZURE_OPENAI_API_KEY=$AZURE_OPENAI_API_KEY"
echo "AZURE_OPENAI_DEPLOYMENT=$AZURE_OPENAI_DEPLOYMENT"

# Run codex with all arguments passed to this script
echo "Running: node $SCRIPT_DIR/dist/cli.js $@"
node "$SCRIPT_DIR/dist/cli.js" "$@" 