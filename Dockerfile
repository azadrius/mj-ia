# Table virtuelle + MJ IA + bot Discord, prêts à tourner sur un PC.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=3001 UPLOAD_DIR=/data/uploads
EXPOSE 3001
CMD ["npm", "start"]
