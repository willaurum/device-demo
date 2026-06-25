# Frontend image: runs the Vite dev server (hot-reload while you learn).
# For a real deployment you'd `npm run build` and serve the static files, but
# the dev server is the friendliest thing to poke at first.
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"]
