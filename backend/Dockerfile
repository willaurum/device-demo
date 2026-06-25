# Backend image: a small Node runtime that runs our Express + MQTT app.
FROM node:20-slim
WORKDIR /app

# Copy package files first and install. Docker caches this layer, so deps are
# only reinstalled when package.json changes -- not on every code edit.
COPY package*.json ./
RUN npm install

# Now copy the source.
COPY . .

EXPOSE 5000
CMD ["npm", "start"]
