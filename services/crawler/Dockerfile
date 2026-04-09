FROM node:20-alpine
WORKDIR /app
COPY services/crawler/package.json package.json
RUN npm install --omit=dev
COPY services/crawler/crawler.mjs crawler.mjs
COPY database /database
CMD ["npm","start"]
