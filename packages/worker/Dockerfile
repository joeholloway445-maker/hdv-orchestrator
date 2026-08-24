FROM node:20-alpine

# isolated-vm requires native build tools
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY packages/worker/package*.json ./
RUN npm install

# Copy Prisma schema from API and generate client
COPY packages/api/prisma ./prisma/
RUN npx prisma generate

COPY packages/worker/src ./src/
COPY packages/worker/tsconfig.json ./

RUN npm run build

CMD ["node", "dist/index.js"]
