FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations

RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=3001
ENV FILE_STORAGE_DIR=/app/storage

EXPOSE 3001

CMD ["npm", "start"]
