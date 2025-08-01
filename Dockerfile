# -------------------------
# Stage 1: Build
# -------------------------
FROM node:24-slim AS build
WORKDIR /usr/src/app

# Install build deps from lockfile (reproducible)
COPY package*.json ./
RUN npm ci

# Copy source and build TS
COPY . .
RUN npm run build

# -------------------------
# Stage 2: Production
# -------------------------
FROM node:24-slim AS production
WORKDIR /app
ENV NODE_ENV=production

# Copy only what we need
COPY --from=build /usr/src/app/dist ./dist
COPY package*.json ./

# Install only production deps cleanly
RUN npm ci --omit=dev

# Drop privileges for security
RUN chown -R node:node /app
USER node

# The app is started by Compose via: command: ["npm","start"]
