#!/bin/bash

# 检查并创建目录
mkdir -p ./data ./logs

# 停止并删除已存在的容器
docker stop listen2me 2>/dev/null || true
docker rm listen2me 2>/dev/null || true

# 构建镜像
docker build -t listen2me .

# 启动容器
docker run -d \
  --name listen2me \
  -p 8080:8080 \
  -p 8081:8081 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/logs:/app/logs \
  --env-file .env \
  --restart unless-stopped \
  listen2me

echo "容器已启动！"
echo "管理界面: http://localhost:8080"
echo "WebSocket: ws://localhost:8081"