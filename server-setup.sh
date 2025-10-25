#!/bin/bash

# Create docker-compose.prod.yml on server
cat > docker-compose.prod.yml << 'EOF'
services:
  backend:
    image: mubashir0409/pixelpulse-backend:latest
    ports:
      - "5000:6000"
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

# Pull and run the containers
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d

echo "PixelPulse is now running!"
echo "Frontend: http://your-server-ip"
echo "Backend: http://your-server-ip:5000"
