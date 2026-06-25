# Simulator image: same small Node runtime, runs the fake fleet.
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npm", "start"]
