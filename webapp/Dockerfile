FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm exec vite build
EXPOSE 3002
CMD ["npm", "start"]
