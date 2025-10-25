#!/bin/bash

# PixelPulse EC2 Deployment Script
set -e

DOCKER_USERNAME="mubashir0409"
IMAGE_NAME="pixelpulse"
TAG="latest"

echo "Building and pushing Docker images..."

# Build and push backend
docker buildx build --platform linux/amd64 -f server/Dockerfile -t $DOCKER_USERNAME/$IMAGE_NAME-backend:$TAG . --push

# Build and push frontend
docker buildx build --platform linux/amd64 -t $DOCKER_USERNAME/$IMAGE_NAME-frontend:$TAG . --push

echo "Images pushed to Docker Hub successfully!"
echo ""
echo "To deploy on EC2, run these commands on your Ubuntu instance:"
echo ""
echo "# Install Docker"
echo "sudo apt update"
echo "sudo apt install -y docker.io docker-compose"
echo "sudo systemctl start docker"
echo "sudo systemctl enable docker"
echo "sudo usermod -aG docker \$USER"
echo ""
echo "# Create deployment directory"
echo "mkdir -p ~/pixelpulse && cd ~/pixelpulse"
echo ""
echo "# Create docker-compose.prod.yml"
echo "cat > docker-compose.prod.yml << 'EOF'"
echo "services:"
echo "  backend:"
echo "    image: $DOCKER_USERNAME/$IMAGE_NAME-backend:$TAG"
echo "    ports:"
echo "      - \"5000:5000\""
echo "    environment:"
echo "      - NODE_ENV=production"
echo "    networks:"
echo "      - app-network"
echo "    restart: unless-stopped"
echo ""
echo "  frontend:"
echo "    image: $DOCKER_USERNAME/$IMAGE_NAME-frontend:$TAG"
echo "    ports:"
echo "      - \"80:80\""
echo "    depends_on:"
echo "      - backend"
echo "    networks:"
echo "      - app-network"
echo "    restart: unless-stopped"
echo ""
echo "networks:"
echo "  app-network:"
echo "    driver: bridge"
echo "EOF"
echo ""
echo "# Deploy"
echo "docker-compose -f docker-compose.prod.yml up -d"
echo ""
echo "# Setup domain (if needed)"
echo "# Point coremango.deciphone.com A record to your EC2 public IP"
