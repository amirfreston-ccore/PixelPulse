#!/bin/bash

# EC2 Ubuntu Setup Script for PixelPulse
# Run this on your Ubuntu EC2 instance

set -e

echo "Setting up PixelPulse on EC2..."

# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
sudo apt install -y docker.io docker-compose
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER

# Create app directory
mkdir -p ~/pixelpulse
cd ~/pixelpulse

# Create production docker-compose file
cat > docker-compose.yml << 'EOF'
services:
  backend:
    image: mubashir0409/pixelpulse-backend:latest
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
    networks:
      - app-network
    restart: unless-stopped

  frontend:
    image: mubashir0409/pixelpulse-frontend:latest
    ports:
      - "80:80"
    depends_on:
      - backend
    networks:
      - app-network
    restart: unless-stopped

networks:
  app-network:
    driver: bridge
EOF

echo "Setup complete!"
echo ""
echo "Next steps:"
echo "1. Replace 'mubashir0409' in docker-compose.yml with your actual Docker Hub username"
echo "2. Run: docker-compose up -d"
echo "3. Point coremango.deciphone.com A record to this EC2 instance's public IP"
echo "4. Access your app at http://coremango.deciphone.com"
