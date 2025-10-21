FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm init -y && npm install express socket.io cors
COPY . .
EXPOSE 5000
CMD ["node", "index.js"]
