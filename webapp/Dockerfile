FROM node:20-alpine
WORKDIR /app
COPY webapp/package.json ./
RUN npm install
COPY webapp/ ./
COPY database /database
RUN npm exec vite build
EXPOSE 3002
CMD ["npm", "start"]
