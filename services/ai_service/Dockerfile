FROM node:20-alpine
WORKDIR /app
COPY package.json package.json
RUN npm install --omit=dev
COPY ai_service.mjs ai_service.mjs
EXPOSE 3010
CMD ["npm","start"]
