# Listen2Me - QQ群聊消息自动处理

## 项目简介

Listen2Me 是一个基于 NapCat 和 OneBot 11 协议的自动化todo生成平台。通过监听QQ群聊消息，使用AI分析技术自动识别和提取待办事项、通知和文娱活动等信息，并提供RSS订阅功能。

## 主要功能

### 🎯 核心功能
- **消息监听**: 通过NapCat的WebSocket反向连接监听指定QQ群聊消息
- **智能分析**: 使用OpenAI兼容的LLM模型分析消息内容
- **事件识别**: 自动识别待办事项、通知、文娱活动等类型的事件
- **RSS订阅**: 提供RSS格式的订阅源，方便集成到其他应用

### 📊 管理功能
- **实时监控**: Web界面实时显示系统状态和处理统计
- **手动触发**: 支持手动触发AI分析任务
- **数据存储**: 本地SQLite数据库存储消息和分析结果

## 技术架构

- **后端**: Node.js + Express
- **数据库**: SQLite
- **AI模型**: OpenAI兼容API (支持自定义endpoint)
- **协议**: OneBot 11
- **前端**: 原生HTML/CSS/JavaScript
- **定时任务**: node-cron

## 快速开始
#### 前置准备
1. 服务器的docker环境
2. clone 代码
3. 运行`cp .env.example .env`并且修改.env中的openai compatible model


### 从原码开始构建
#### 1. 环境要求

- Node.js >= 16.0.0
- NapCat (已配置OneBot 11)

#### 2. 安装依赖

```bash
npm install
```

#### 3. 配置环境

复制并编辑配置文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置以下关键参数：

```env


# 监听的群聊ID列表，用逗号分隔
LISTEN_GROUP_IDS=123456789,987654321

# OpenAI兼容的模型配置
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-3.5-turbo

# AI分析配置
AI_ANALYSIS_INTERVAL_MINUTES=30
AI_CONTEXT_WINDOW_HOURS=2
AI_MAX_MESSAGES_PER_ANALYSIS=50

# 数据库配置

DATABASE_PATH=./data/listen2me.db

# RSS配置
RSS_TITLE=Listen2Me Todo Feed
RSS_DESCRIPTION=Automated todo and events from monitored groups
RSS_BASE_URL=http://localhost:8080
```

#### 4. 启动服务

```bash
# 开发模式
npm run dev

# 生产模式
npm start
```
### 使用Docker部署
#### 1. 构建docker image
使用docker build . -t '容器的名字'，从dockerfile构建镜像

#### 2. 运行镜像
运行mkdir -p ./data && docker run -p 8080:8080 -p 8081:8081 -v $(pwd)/data:/app/data test
>


### 5. 配置NapCat

**使用WebSocket反向连接模式：**

在NapCat配置中添加WebSocket反向连接：

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

**注意：**
- 不需要添加 `/ws` 路径，直接连接到端口即可
- 如果NapCat运行在Docker中，使用 `ws://host.docker.internal:8081` 或你的实际IP地址
- 如果连接失败，请检查防火墙设置和网络连接

## 使用说明

### 管理界面

访问 `http://localhost:8080` 查看系统状态，包括：

- **系统状态**: 消息处理统计、AI分析状态
- **监听配置**: 当前监听的群聊列表
- **定时任务**: AI分析任务的运行状态
- **最近事件**: 最新识别的待办事项和通知

### RSS订阅

系统提供多个RSS订阅端点：

- `http://localhost:8080/rss` - 所有事件
- `http://localhost:8080/rss/todo` - 待办事项
- `http://localhost:8080/rss/notification` - 通知
- `http://localhost:8080/rss/entertainment` - 文娱活动

### API接口

- `GET /api/status` - 系统状态
- `GET /api/events` - 获取事件列表
- `POST /api/analysis/trigger` - 手动触发分析
- `GET /api/analysis/stats` - 分析统计信息
- `GET /health` - 健康检查

## OneBot 11 事件支持

系统基于OneBot 11协议，支持以下消息事件：

- `message.group.normal` - 群聊普通消息
- `message_sent.group.normal` - 发送的群聊消息

详细的事件结构请参考 `ONEBOT_EVENT_DOCS.md`。

## 配置说明

### 监听群聊配置

在 `LISTEN_GROUP_IDS` 中配置要监听的QQ群号，多个群号用逗号分隔：

```env
LISTEN_GROUP_IDS=123456789,987654321,555666777
```

### AI模型配置

支持任何OpenAI兼容的API：

```env
# OpenAI官方
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_MODEL=gpt-3.5-turbo

# 本地部署
OPENAI_API_BASE=http://localhost:1234/v1
OPENAI_MODEL=llama2

# 其他第三方服务
OPENAI_API_BASE=https://api.example.com/v1
OPENAI_MODEL=custom-model
```

### 分析间隔配置

AI分析任务的执行间隔可以通过 `AI_ANALYSIS_INTERVAL_MINUTES` 配置，建议值：

- 实时性要求高: 5-15分钟
- 正常使用: 30-60分钟
- 节省资源: 120-360分钟

## 消息类型识别

系统会自动识别以下类型的消息：

### 待办事项 (todo)
包含以下关键词的消息会被识别为待办事项：
- 待办、要做、需要、记得、别忘、提醒、安排
- 计划、任务、完成、截止、期限、明天、后天
- 下周、下月、todo等

### 通知 (notification)
包含以下关键词的消息会被识别为通知：
- 通知、公告、提醒、注意、重要、紧急、消息
- 告知、宣布、声明、发布、更新、变更、取消

### 文娱活动 (entertainment)
包含以下关键词的消息会被识别为文娱活动：
- 活动、聚会、聚餐、游戏、电影、ktv、旅游
- 比赛、演出、展览、party、约、一起、参加
- 报名、组队、开黑、打游戏

## 数据存储

系统使用SQLite数据库存储数据，主要表结构：

- `messages` - 原始消息数据
- `analyzed_events` - AI分析结果
- `system_stats` - 系统统计信息
- `analysis_tasks` - 分析任务记录

数据库文件默认存储在 `./data/listen2me.db`。

## 故障排除

### 常见问题

1. **无法接收消息**
   - 检查NapCat配置是否正确
   - 确认webhook地址可访问
   - 检查群聊ID配置是否正确

2. **AI分析不工作**
   - 确认API密钥配置正确
   - 检查API endpoint可访问
   - 查看日志中的错误信息

3. **RSS订阅无内容**
   - 确认有已识别的事件
   - 检查事件状态是否为active

### 日志查看

应用启动后会在控制台输出详细日志，包括：
- 消息接收和处理状态
- AI分析任务执行情况
- 系统错误和警告信息

## 开发说明

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

### 扩展功能

系统采用模块化设计，可以轻松扩展：

- 添加新的事件类型识别
- 集成其他AI模型
- 扩展RSS功能
- 添加其他通知方式

## 许可证

MIT License

## 贡献

欢迎提交Issue和Pull Request来改进项目。

## 联系方式

如有问题或建议，请通过GitHub Issues联系。
