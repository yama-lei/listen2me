# Listen2Me - QQ群聊消息自动处理

## 项目简介

Listen2Me 是一个基于 NapCat 和 OneBot 11 协议的自动化todo生成平台。通过监听QQ群聊消息，使用AI分析技术自动识别和提取待办事项、通知和文娱活动等信息，并提供RSS订阅功能。

## 主要功能
1. **群聊监听** - 自动监听指定QQ群聊消息
2. **AI分析** - 使用大语言模型识别待办事项、通知和文娱活动
3. **管理员私聊** - 支持管理员通过私聊添加和管理事件
4. **RSS订阅** - 提供RSS订阅功能，支持分类订阅
5. **Web管理界面** - 提供Web界面查看和管理事件
6. **定时分析** - 自动定时分析群聊消息并提取关键信息

![首页](pictures/head.png)

## 快速开始
### 前置准备
#### 准备代码
1. 服务器的docker环境
2. clone 代码
3. 运行`cp .env.example .env`并且修改.env其中配置，具体配置请见补充部分。
4. 按照自己需求修改`src/services/aiAnalysisService.js`里面的prompt部分代码

#### 配置NapCat环境
NapCat官方repo：https://github.com/NapNeko/NapCatQQ
NapCat官方文档：https://napneko.github.io/

1. 安装NapCat
2. 在NapCat配置中添加WebSocket反向连接：
> 可以登录napcat的webui进行配置，napcat的webui默认端口为6099
```json
{
  "reverseWs": {
    "enable": true,
    "urls": [
      "ws://127.0.0.1:8081"
    ]
  }
}
```

#### 运行listen2me

### 从源码开始构建

1. 安装依赖

```bash
npm install
```

2. 启动服务

```bash
# 开发模式
npm run dev
# 生产模式
npm start
```
### 使用Docker部署
#### Docker一键部署
运行 `./start.sh` 即可构建Docker镜像并运行容器

#### 1. 构建Docker镜像
```bash
docker build . -t listen2me
```

#### 2. 运行容器
```bash
docker run -d \
  --name listen2me \
  -p 8080:8080 \
  -p 8081:8081 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/logs:/app/logs \
  --env-file .env \
  --restart unless-stopped \
  listen2me
```
> 提示：可以通过修改 `-v` 参数来指定数据存储位置




## 补充说明

### .env环境配置

```env
# WebSocket配置
WEBSOCKET_PORT=8081
WEBSOCKET_HOST=0.0.0.0
WEBSOCKET_SECRET=

# HTTP管理界面配置
HTTP_PORT=8080

# 监听的群聊ID列表，用逗号分隔
LISTEN_GROUP_IDS=123456789,987654321

# OpenAI兼容的模型配置
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-3.5-turbo

# AI分析配置
AI_ANALYSIS_INTERVAL_MINUTES=120
AI_CONTEXT_WINDOW_HOURS=2
AI_MAX_MESSAGES_PER_ANALYSIS=50
AI_LONG_MESSAGE_THRESHOLD=50
AI_SHORT_MESSAGE_BATCH_SIZE=10

# 数据库配置
DATABASE_PATH=./data/listen2me.db

# RSS配置
RSS_TITLE=Listen2Me Todo Feed
RSS_DESCRIPTION=Automated todo and events from monitored groups
RSS_BASE_URL=http://localhost:8080

# 日志配置
LOG_LEVEL=info

# 管理员账号ID列表，用逗号分隔 (支持多个管理员)
ADMIN_IDS=1234567,7654321
```

### 管理员私聊功能

管理员可以通过私聊与机器人交互：

**可用命令：**
- `/help` - 显示帮助信息
- `/all` 或 `ls` - 查看所有事件
- `/del [事件ID]` 或 `rm [事件ID]` - 删除指定事件
- `/add [内容]` - 添加新事件（AI分析）

**使用示例：**
```
/add 明天下午3点开会讨论项目进度
/del 123
/all
```

### Web管理界面
- 访问 `http://localhost:8080` 查看Web管理界面
- 支持查看事件列表、系统状态和统计信息
- 界面文件位于 `/public/index.html`，可根据需要修改
### RSS订阅

系统提供多个RSS订阅端点：
- `http://localhost:8080/rss` - 所有事件
- `http://localhost:8080/rss/todo` - 待办事项
- `http://localhost:8080/rss/notification` - 通知
- `http://localhost:8080/rss/entertainment` - 文娱活动

### API接口

**系统接口：**
- `GET /api/status` - 系统状态
- `GET /health` - 健康检查

**事件接口：**
- `GET /api/events` - 获取事件列表
- `GET /api/events?type=todo` - 获取待办事项
- `GET /api/events?type=notification` - 获取通知
- `GET /api/events?type=entertainment` - 获取文娱活动

**分析接口：**
- `POST /api/analysis/trigger` - 手动触发分析
- `GET /api/analysis/stats` - 分析统计信息



### 数据库存储
系统使用SQLite数据库存储数据，主要表结构：

- `messages` - 原始消息数据
- `analyzed_events` - AI分析结果
- `system_stats` - 系统统计信息
- `analysis_tasks` - 分析任务记录

数据库文件默认存储在 `./data/listen2me.db`
### 项目结构

```
listen2me/
├── src/
│   ├── app.js                 # 主应用文件
│   ├── controllers/           # 控制器
│   ├── models/               # 数据模型
│   ├── services/             # 业务服务
│   ├── middlewares/          # 中间件
│   └── utils/                # 工具函数
├── public/                   # 前端静态文件
├── data/                     # 数据库文件
├── logs/                     # 日志文件
├── .env.example             # 配置示例
└── README.md               # 项目说明
```

## 注意事项

1. **权限配置**：确保NapCat有足够的权限访问指定群聊
2. **API配置**：需要配置有效的OpenAI兼容API密钥
3. **管理员配置**：在 `.env` 文件中正确配置管理员QQ号
4. **数据备份**：定期备份 `data` 目录下的数据库文件

## 故障排除

**常见问题：**
- 如果NapCat连接失败，检查WebSocket配置和端口
- 如果AI分析失败，检查API密钥和网络连接
- 如果管理员功能不工作，检查QQ号配置是否正确

## 开发计划

- [ ] 完善消息类型定义
- [ ] 优化context来提升模型的准确性
- [ ] 添加事件提醒功能
