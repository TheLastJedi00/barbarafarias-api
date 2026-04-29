# BUILD
FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./

ENV NODE_ENV=development 
RUN npm install

COPY . .

# Converte o TS para JS
RUN npm run build


# PRODUÇÃO
FROM node:24-alpine 

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production

COPY --from=builder /app/dist ./dist

RUN chown -R node:node /app
USER node

EXPOSE 8080

CMD ["node", "dist/main"]
