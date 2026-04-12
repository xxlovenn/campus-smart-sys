FROM node:20
WORKDIR /app
ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com
ENV PRISMA_ENGINES_MIRROR=https://cdn.npmmirror.com/binaries/prisma
COPY package.json ./
RUN npm install
COPY . .
RUN npx prisma generate && npm run build
ENV NODE_ENV=production
EXPOSE 3001
CMD ["npm", "run", "start:container"]
