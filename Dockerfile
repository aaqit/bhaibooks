# ---------------------------------------------------------------------------
# BahiBooks ERP - production image (web / online deployment)
# Node 24 chahiye kyunki app built-in `node:sqlite` (DatabaseSync) use karta hai.
# ---------------------------------------------------------------------------
FROM node:24-slim

WORKDIR /app

# 1) Backend dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 2) Frontend build
COPY client/package.json client/package-lock.json ./client/
RUN npm --prefix client ci
COPY client ./client
COPY server ./server
COPY desktop ./desktop
RUN npm --prefix client run build

# 3) Runtime config
ENV NODE_ENV=production \
    PORT=4000 \
    ACCESS_MODE=web \
    WEB_FULL_ACCESS=true \
    BAHI_DATA_DIR=/data

# Data volume (master.db + har company ka db yahan rehta hai)
RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 4000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
