FROM node:20-alpine
RUN apk add --no-cache patch
WORKDIR /app/services/worker
COPY services/worker/package.json package.json
RUN npm install --omit=dev
COPY services/worker ./
COPY database /app/database
RUN patch -p3 < worker_production.patch
CMD ["npm","start"]
