FROM node:22.18.0-alpine

WORKDIR /app

# 设置南大 npm 源
ENV NPM_CONFIG_REGISTRY=https://repo.nju.edu.cn/repository/npm/

# 先复制package文件，利用Docker缓存
COPY package*.json ./
RUN npm ci --only=production

# 复制应用代码
COPY . .

# 创建数据目录和日志目录并设置权限
RUN mkdir -p /app/data /app/logs && chown -R node:node /app/data /app/logs

# 创建数据卷挂载点
VOLUME ["/app/data", "/app/logs"]

EXPOSE 8080 8081

# 切换到非root用户
USER node

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["npm", "run", "start"]