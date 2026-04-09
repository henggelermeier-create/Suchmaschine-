FROM node:20-alpine
WORKDIR /app
COPY services/worker/package.json package.json
RUN npm install --omit=dev
COPY services/worker/worker.mjs worker.mjs
COPY database /database
CMD ["npm","start"]
