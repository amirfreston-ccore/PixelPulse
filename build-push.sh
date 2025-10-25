#!/bin/bash

# Replace with your Docker Hub username
DOCKER_USERNAME="mubashir0409"

echo "Building and pushing backend image..."
docker buildx build --platform linux/amd64 -f server/Dockerfile -t $DOCKER_USERNAME/pixelpulse-backend:latest . --push

echo "Building and pushing frontend image..."
docker buildx build --platform linux/amd64 -t $DOCKER_USERNAME/pixelpulse-frontend:latest . --push

echo "Done! Images pushed successfully."
