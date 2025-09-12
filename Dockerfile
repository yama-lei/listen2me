FROM node:22.18.0-alpine

WORKDIR /app

# 设置南大 npm 源
ENV NPM_CONFIG_REGISTRY=https://repo.nju.edu.cn/repository/npm/

COPY . .

RUN npm ci --only=production

# 创建数据目录并设置权限
RUN mkdir -p /app/data && chown -R node:node /app/data

# 创建数据卷挂载点
VOLUME ["/app/data"]

EXPOSE 8080 8081

# 切换到非root用户
USER node

CMD ["npm", "run", "start" ]
