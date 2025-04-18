#!/bin/bash

# Get the actual script location, following symlinks
SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(dirname "$SCRIPT_PATH")"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Script directory: $SCRIPT_DIR"

# Source .env file if it exists, first check script directory then parent
ENV_FILE="$SCRIPT_DIR/.env"
PARENT_ENV_FILE="$PARENT_DIR/.env"

if [ -f "$ENV_FILE" ]; then
    echo "Loading environment variables from $ENV_FILE"
    set -a
    source "$ENV_FILE"
    set +a
elif [ -f "$PARENT_ENV_FILE" ]; then
    echo "Loading environment variables from $PARENT_ENV_FILE"
    set -a
    source "$PARENT_ENV_FILE"
    set +a
else
    echo "Warning: .env file not found at $ENV_FILE or $PARENT_ENV_FILE"
fi

# Unset OpenAI API key to ensure we use Azure OpenAI
# unset OPENAI_API_KEY
# echo "Unset OPENAI_API_KEY"

# Set Azure OpenAI environment variables

echo "Using Azure OpenAI environment variables:"
echo "AZURE_OPENAI_API_VERSION=$AZURE_OPENAI_API_VERSION"
echo "AZURE_OPENAI_ENDPOINT=$AZURE_OPENAI_ENDPOINT"
echo "AZURE_OPENAI_API_KEY=$AZURE_OPENAI_API_KEY"
echo "AZURE_OPENAI_DEPLOYMENT=$AZURE_OPENAI_DEPLOYMENT"
echo "OPENAI_API_KEY=$OPENAI_API_KEY"

# Run codex with all arguments passed to this script
echo "Running: node $SCRIPT_DIR/dist/cli.js $@"
# Pass environment variables to the Node.js process
node "$SCRIPT_DIR/dist/cli.js" "$@" 
