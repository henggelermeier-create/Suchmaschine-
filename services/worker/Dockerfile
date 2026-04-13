FROM node:20-alpine
WORKDIR /app
COPY services/worker/package.json package.json
RUN npm install --omit=dev
COPY services/worker/worker.mjs worker.mjs
COPY services/worker/open_web_discovery.mjs open_web_discovery.mjs
COPY services/worker/worker_healthcheck.mjs worker_healthcheck.mjs
COPY database /database
CMD ["npm","start"]
