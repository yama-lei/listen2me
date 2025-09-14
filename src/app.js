require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

// 导入自定义模块
const Database = require('./models/database');
const MessageFilter = require('./services/messageFilter');
const MessageController = require('./controllers/messageController');
const AIAnalysisService = require('./services/aiAnalysisService');
const SchedulerService = require('./services/schedulerService');
const RSSService = require('./services/rssService');
const WebSocketService = require('./services/websocketService');
const LoggingService = require('./services/loggingService');
const AdminService = require('./services/adminService');

class Listen2MeApp {
    constructor() {
        this.app = express();
        this.database = null;
        this.messageFilter = null;
        this.messageController = null;
        this.aiAnalysisService = null;
        this.schedulerService = null;
        this.rssService = null;
        this.websocketService = null;
        this.loggingService = null;
        this.adminService = null;
        
        this.config = {
            PORT: process.env.WEBSOCKET_PORT || 8081,  // 现在主端口就是WebSocket端口
            HOST: process.env.WEBSOCKET_HOST || '0.0.0.0',
            HTTP_PORT: process.env.HTTP_PORT || 8080,  // HTTP管理界面端口
            WEBSOCKET_SECRET: process.env.WEBSOCKET_SECRET,
            DATABASE_PATH: process.env.DATABASE_PATH || './data/listen2me.db',
            LISTEN_GROUP_IDS: process.env.LISTEN_GROUP_IDS || '',
            OPENAI_API_BASE: process.env.OPENAI_API_BASE,
            OPENAI_API_KEY: process.env.OPENAI_API_KEY,
            OPENAI_MODEL: process.env.OPENAI_MODEL,
            AI_ANALYSIS_INTERVAL_MINUTES: process.env.AI_ANALYSIS_INTERVAL_MINUTES,
            AI_CONTEXT_WINDOW_HOURS: process.env.AI_CONTEXT_WINDOW_HOURS,
            AI_MAX_MESSAGES_PER_ANALYSIS: process.env.AI_MAX_MESSAGES_PER_ANALYSIS,
            AI_LONG_MESSAGE_THRESHOLD: process.env.AI_LONG_MESSAGE_THRESHOLD,
            AI_SHORT_MESSAGE_BATCH_SIZE: process.env.AI_SHORT_MESSAGE_BATCH_SIZE,
            RSS_TITLE: process.env.RSS_TITLE,
            RSS_DESCRIPTION: process.env.RSS_DESCRIPTION,
            RSS_BASE_URL: process.env.RSS_BASE_URL,
            ADMIN_ID: process.env.ADMIN_ID,
            ADMIN_IDS: process.env.ADMIN_IDS
        };

        this.init();
    }

    async init() {
        try {
            // 初始化数据库
            this.database = new Database(this.config.DATABASE_PATH);
            
            // 初始化日志服务
            this.loggingService = new LoggingService(this.config);
            
            // 初始化消息过滤器
            this.messageFilter = new MessageFilter(this.config);
            
            // 初始化AI分析服务
            this.aiAnalysisService = new AIAnalysisService(this.config, this.database, this.loggingService);
            
            // 初始化WebSocket服务
            this.websocketService = new WebSocketService(this.config, this.database, this.messageFilter, null, this.loggingService);
            
            // 初始化管理员服务
            this.adminService = new AdminService(this.config, this.database, this.aiAnalysisService, this.loggingService, this.websocketService);
            
            // 初始化消息控制器
            this.messageController = new MessageController(this.database, this.messageFilter, this.loggingService, this.adminService);
            
            // 更新WebSocket服务的消息控制器引用
            this.websocketService.messageController = this.messageController;
            
            // 初始化调度服务
            this.schedulerService = new SchedulerService(this.aiAnalysisService, this.config, this.database);
            
            // 初始化RSS服务
            this.rssService = new RSSService(this.config, this.database);
            
            // 设置Express中间件
            this.setupMiddlewares();
            
            // 设置路由
            this.setupRoutes();
            
            // 启动服务器
            this.startServer();
            
            // 启动定时任务
            this.schedulerService.start();
            
            console.log('Listen2Me应用初始化完成');
        } catch (error) {
            console.error('应用初始化失败:', error);
            process.exit(1);
        }
    }

    setupMiddlewares() {
        // 安全中间件
        this.app.use(helmet({
            contentSecurityPolicy: false, // 临时禁用CSP以便开发
        }));
        
        // CORS
        this.app.use(cors());
        
        // 静态文件服务
        this.app.use(express.static(path.join(__dirname, '../public')));
        
        // JSON解析
        this.app.use(express.json());
        
        // 健康检查路由
        this.app.get('/health', (req, res) => {
            res.status(200).json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                websocket: this.websocketService?.getConnectionStatus() || {},
                ...this.messageController?.getStatus() || {}
            });
        });
    }

    setupRoutes() {
        // API路由
        this.app.get('/api/status', (req, res) => {
            res.json(this.messageController.getStatus());
        });

        this.app.get('/api/stats', async (req, res) => {
            try {
                const stats = await this.database.getStats();
                res.json(stats);
            } catch (error) {
                console.error('获取统计信息失败:', error);
                res.status(500).json({ error: '获取统计信息失败' });
            }
        });

        this.app.get('/api/events', async (req, res) => {
            try {
                const { limit = 20, type, includeExpired = false } = req.query;
                const events = await this.database.getRecentEvents(parseInt(limit), type, includeExpired === 'true');
                res.json(events);
            } catch (error) {
                console.error('获取事件失败:', error);
                res.status(500).json({ error: '获取事件失败' });
            }
        });

        this.app.get('/api/messages', async (req, res) => {
            try {
                const { limit = 20 } = req.query;
                const messages = await this.database.getUnprocessedMessages(parseInt(limit));
                res.json(messages);
            } catch (error) {
                console.error('获取消息失败:', error);
                res.status(500).json({ error: '获取消息失败' });
            }
        });

        // AI分析相关接口
        this.app.post('/api/analysis/trigger', async (req, res) => {
            try {
                console.log('手动触发AI分析');
                const result = await this.aiAnalysisService.analyzeMessages();
                res.json({
                    success: true,
                    ...result
                });
            } catch (error) {
                console.error('手动分析失败:', error);
                res.status(500).json({ 
                    success: false, 
                    error: error.message 
                });
            }
        });

        this.app.get('/api/analysis/stats', async (req, res) => {
            try {
                const stats = await this.aiAnalysisService.getAnalysisStats();
                res.json(stats);
            } catch (error) {
                console.error('获取分析统计失败:', error);
                res.status(500).json({ error: '获取分析统计失败' });
            }
        });

        this.app.get('/api/scheduler/status', (req, res) => {
            try {
                const status = this.schedulerService.getStatus();
                res.json(status);
            } catch (error) {
                console.error('获取调度器状态失败:', error);
                res.status(500).json({ error: '获取调度器状态失败' });
            }
        });

        this.app.post('/api/scheduler/expiration-check', async (req, res) => {
            try {
                console.log('手动触发过期事件检查');
                await this.schedulerService.triggerExpirationCheck();
                res.json({ success: true, message: '过期事件检查已触发' });
            } catch (error) {
                console.error('手动过期检查失败:', error);
                res.status(500).json({ 
                    success: false, 
                    error: error.message 
                });
            }
        });

        this.app.get('/api/events/expired-stats', async (req, res) => {
            try {
                const stats = await this.database.getExpiredEventsStats();
                res.json(stats);
            } catch (error) {
                console.error('获取过期事件统计失败:', error);
                res.status(500).json({ error: '获取过期事件统计失败' });
            }
        });

        this.app.delete('/api/events/:id', async (req, res) => {
            try {
                const eventId = parseInt(req.params.id);
                if (isNaN(eventId)) {
                    return res.status(400).json({ error: '无效的事件ID' });
                }

                const success = await this.database.deleteEvent(eventId);
                if (success) {
                    res.json({ success: true, message: '事件已删除' });
                } else {
                    res.status(404).json({ error: '事件不存在' });
                }
            } catch (error) {
                console.error('删除事件失败:', error);
                res.status(500).json({ error: '删除事件失败' });
            }
        });

        // RSS相关路由
        this.app.get('/rss', async (req, res) => {
            try {
                const { type, limit, includeCompleted, includeExpired } = req.query;
                const rssXml = await this.rssService.generateFeed({
                    eventType: type || null,
                    limit: parseInt(limit) || 50,
                    includeCompleted: includeCompleted === 'true',
                    includeExpired: includeExpired === 'true'
                });
                
                res.set({
                    'Content-Type': 'application/rss+xml; charset=utf-8',
                    'Cache-Control': 'public, max-age=3600' // 缓存1小时
                });
                
                res.send(rssXml);
            } catch (error) {
                console.error('生成RSS失败:', error);
                res.status(500).json({ error: '生成RSS失败' });
            }
        });

        this.app.get('/rss/todo', async (req, res) => {
            try {
                const rssXml = await this.rssService.generateTodoFeed();
                res.set({
                    'Content-Type': 'application/rss+xml; charset=utf-8',
                    'Cache-Control': 'public, max-age=3600'
                });
                res.send(rssXml);
            } catch (error) {
                console.error('生成Todo RSS失败:', error);
                res.status(500).json({ error: '生成Todo RSS失败' });
            }
        });

        this.app.get('/rss/notification', async (req, res) => {
            try {
                const rssXml = await this.rssService.generateNotificationFeed();
                res.set({
                    'Content-Type': 'application/rss+xml; charset=utf-8',
                    'Cache-Control': 'public, max-age=3600'
                });
                res.send(rssXml);
            } catch (error) {
                console.error('生成通知RSS失败:', error);
                res.status(500).json({ error: '生成通知RSS失败' });
            }
        });

        this.app.get('/rss/entertainment', async (req, res) => {
            try {
                const rssXml = await this.rssService.generateEntertainmentFeed();
                res.set({
                    'Content-Type': 'application/rss+xml; charset=utf-8',
                    'Cache-Control': 'public, max-age=3600'
                });
                res.send(rssXml);
            } catch (error) {
                console.error('生成文娱RSS失败:', error);
                res.status(500).json({ error: '生成文娱RSS失败' });
            }
        });

        this.app.get('/api/rss/stats', async (req, res) => {
            try {
                const stats = await this.rssService.getRSSStats();
                res.json(stats);
            } catch (error) {
                console.error('获取RSS统计失败:', error);
                res.status(500).json({ error: '获取RSS统计失败' });
            }
        });

        // WebSocket相关接口
        this.app.get('/api/websocket/status', (req, res) => {
            try {
                const status = this.websocketService.getConnectionStatus();
                res.json(status);
            } catch (error) {
                console.error('获取WebSocket状态失败:', error);
                res.status(500).json({ error: '获取WebSocket状态失败' });
            }
        });

        this.app.get('/api/websocket/stats', (req, res) => {
            try {
                const stats = this.websocketService.getStats();
                res.json(stats);
            } catch (error) {
                console.error('获取WebSocket统计失败:', error);
                res.status(500).json({ error: '获取WebSocket统计失败' });
            }
        });

        // 日志相关接口
        this.app.get('/api/logs/stats', (req, res) => {
            try {
                const stats = this.loggingService.getLogStats();
                res.json(stats);
            } catch (error) {
                console.error('获取日志统计失败:', error);
                res.status(500).json({ error: '获取日志统计失败' });
            }
        });

        this.app.post('/api/logs/clean', (req, res) => {
            try {
                const { daysToKeep = 30 } = req.body;
                this.loggingService.cleanOldLogs(daysToKeep);
                res.json({ success: true, message: `已清理${daysToKeep}天前的日志文件` });
            } catch (error) {
                console.error('清理日志失败:', error);
                res.status(500).json({ error: '清理日志失败' });
            }
        });

        // 管理员相关接口
        this.app.get('/api/admin/status', (req, res) => {
            try {
                const status = this.adminService.getStatus();
                res.json(status);
            } catch (error) {
                console.error('获取管理员服务状态失败:', error);
                res.status(500).json({ error: '获取管理员服务状态失败' });
            }
        });

        this.app.post('/api/admin/send-message', async (req, res) => {
            try {
                const { message } = req.body;
                if (!message) {
                    return res.status(400).json({ error: '消息内容不能为空' });
                }

                const success = await this.adminService.sendMessageToAdmin(message);
                if (success) {
                    res.json({ success: true, message: '消息已发送给管理员' });
                } else {
                    res.status(500).json({ success: false, error: '发送消息失败' });
                }
            } catch (error) {
                console.error('发送消息给管理员失败:', error);
                res.status(500).json({ error: '发送消息失败' });
            }
        });

        // 默认路由 - 返回前端页面
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../public/index.html'));
        });

        // 404处理
        this.app.use('*', (req, res) => {
            res.status(404).json({ 
                error: 'Not Found',
                message: `路径 ${req.originalUrl} 不存在`
            });
        });

        // 错误处理中间件
        this.app.use((err, req, res, next) => {
            console.error('未处理的错误:', err);
            res.status(500).json({
                error: 'Internal Server Error',
                message: process.env.NODE_ENV === 'development' ? err.message : '服务器内部错误'
            });
        });
    }

    startServer() {
        this.server = this.app.listen(this.config.HTTP_PORT, this.config.HOST, () => {
            console.log(`🚀 Listen2Me服务器启动成功`);
            console.log(`🔌 WebSocket地址: ws://${this.config.HOST}:${this.config.PORT}`);
            console.log(`🌐 管理界面: http://${this.config.HOST}:${this.config.HTTP_PORT}`);
            console.log(`📊 健康检查: http://${this.config.HOST}:${this.config.HTTP_PORT}/health`);
            console.log(`👥 监听群聊: ${this.config.LISTEN_GROUP_IDS}`);
            
            if (!this.config.WEBSOCKET_SECRET) {
                console.warn('⚠️  警告: 未配置WebSocket认证密钥，建议设置以提高安全性');
            }
        });
    }

    async shutdown() {
        console.log('正在关闭服务器...');
        
        if (this.schedulerService) {
            this.schedulerService.stop();
        }
        
        if (this.websocketService) {
            this.websocketService.close();
        }
        
        if (this.server) {
            this.server.close();
        }
        
        if (this.database) {
            await this.database.close();
        }
        
        console.log('服务器已关闭');
        process.exit(0);
    }
}

// 创建应用实例
const app = new Listen2MeApp();

// 优雅关闭处理
process.on('SIGINT', () => app.shutdown());
process.on('SIGTERM', () => app.shutdown());

// 未捕获异常处理
process.on('uncaughtException', (err) => {
    console.error('未捕获的异常:', err);
    app.shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('未处理的Promise拒绝:', reason);
    console.error('Promise:', promise);
});

module.exports = app;
