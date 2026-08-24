FROM node:20-alpine

WORKDIR /app

COPY packages/api/package*.json ./
RUN npm install

COPY packages/api/prisma ./prisma/
RUN npx prisma generate

COPY packages/api/src ./src/
COPY packages/api/tsconfig.json ./

RUN npm run build

EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
