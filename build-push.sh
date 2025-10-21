#!/bin/bash

# Replace with your Docker Hub username
DOCKER_USERNAME="mubashir0409"

echo "Building backend image..."
docker build -f server/Dockerfile -t $DOCKER_USERNAME/pixelpulse-backend:latest .

echo "Building frontend image..."
docker build -t $DOCKER_USERNAME/pixelpulse-frontend:latest .

echo "Pushing images to Docker Hub..."
docker push $DOCKER_USERNAME/pixelpulse-backend:latest
docker push $DOCKER_USERNAME/pixelpulse-frontend:latest

echo "Done! Images pushed successfully."
