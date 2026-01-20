
# ------------------------------
# 1. Build Stage
# ------------------------------
FROM node:25-alpine AS builder
WORKDIR /app

# Copy dependencies first for caching
COPY package.json package-lock.json ./ 
RUN npm ci

# Copy source code
COPY . .

# Build Next.js app
# Note: Since we have a custom server, we might need to build the server too if we want to run it with node (not ts-node) in production for performance, 
# but package.json 'start' script uses ts-node. We will stick to the user's start script for simplicity unless we want to compile server.ts.
# Current package.json: "start": "NODE_ENV=production ts-node --project tsconfig.server.json server.ts"
RUN npm run build


# ------------------------------
# 2. Production Stage
# ------------------------------
FROM node:25-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules

# Copy custom server files
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/tsconfig.server.json ./tsconfig.server.json
# We might need tsconfig.json too if ts-node needs it or if tsconfig.server.json extends it
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Set permissions
RUN chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# Expose the port the app runs on
EXPOSE 3001

# Start command (SAME as package.json 'start')
CMD ["npm", "run", "start"]
