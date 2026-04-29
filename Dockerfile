# Build da aplicação
FROM node:24-alpine AS builder
WORKDIR /app
COPY ["package.json", "package-lock.json*", "npm-shrinkwrap.json*", "./"]
ENV NODE_ENV=development
RUN npm install --only=production
COPY . .
RUN npm run build
# Preparar para produção
FROM node:24-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
# Template padrão do docker pra criação de user
RUN chown -R node:node /app
USER node
EXPOSE 8080
CMD ["node", "dist/main"]
