FROM node:20
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npx prisma generate && npm run build
ENV NODE_ENV=production
EXPOSE 3001
CMD ["npm", "run", "start:container"]
