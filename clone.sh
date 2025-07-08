#!/bin/bash

set -e

# Check required environment variables
if [ -z "$RELEASER_GIT_URL" ] || [ -z "$RELEASER_GIT_COMMIT_SHA" ] || [ -z "$RELEASER_RELEASE_COMMAND" ]; then
    echo "Error: RELEASER_GIT_URL, RELEASER_GIT_COMMIT_SHA, and RELEASE_RELEASE_COMMAND must be set"
    exit 1
fi

# Extract repo name from URL
REPO_NAME=$(basename "$RELEASER_GIT_URL" .git)

# Clone if repo doesn't exist
if [ ! -d "$REPO_NAME" ]; then
    echo "Cloning $RELEASER_GIT_URL at commit $RELEASER_GIT_COMMIT_SHA..."
    # Clone the repo first, then checkout the specific commit
    git clone "$RELEASER_GIT_URL" "$REPO_NAME"
    cd "$REPO_NAME"
    git checkout "$RELEASER_GIT_COMMIT_SHA"
    cd ..
else
    # If repo exists, just checkout the specific commit
    cd "$REPO_NAME"
    git fetch origin
    git checkout "$RELEASER_GIT_COMMIT_SHA"
    cd ..
fi

# Execute release command
cd "$REPO_NAME"
eval "$RELEASER_RELEASE_COMMAND"
