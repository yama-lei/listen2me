const RSS = require('rss');

/**
 * RSS服务
 * 生成RSS订阅源
 */
class RSSService {
    constructor(config, database) {
        this.config = config;
        this.database = database;
        
        this.rssConfig = {
            title: config.RSS_TITLE || 'Listen2Me Todo Feed',
            description: config.RSS_DESCRIPTION || 'Automated todo and events from monitored groups',
            feed_url: `${config.RSS_BASE_URL || 'http://localhost:8080'}/rss`,
            site_url: config.RSS_BASE_URL || 'http://localhost:8080',
            language: 'zh-CN',
            pubDate: new Date(),
            ttl: 60 // 缓存时间（分钟）
        };
    }

    /**
     * 生成RSS Feed
     * @param {Object} options 选项
     * @returns {string} RSS XML内容
     */
    async generateFeed(options = {}) {
        const {
            limit = 50,
            eventType = null,
            includeCompleted = false
        } = options;

        // 创建RSS对象
        const feed = new RSS(this.rssConfig);

        try {
            // 获取事件数据
            const events = await this.getEventsForFeed(limit, eventType, includeCompleted);

            // 添加事件到RSS feed
            events.forEach(event => {
                const item = this.formatEventAsRSSItem(event);
                feed.item(item);
            });

            return feed.xml({ indent: true });
        } catch (error) {
            console.error('生成RSS Feed失败:', error);
            throw error;
        }
    }

    /**
     * 获取用于RSS的事件数据
     */
    async getEventsForFeed(limit, eventType, includeCompleted) {
        return new Promise((resolve, reject) => {
            let sql = `
                SELECT * FROM analyzed_events 
                WHERE 1=1
            `;
            const params = [];

            if (!includeCompleted) {
                sql += ` AND status != 'completed'`;
            }

            if (eventType) {
                sql += ` AND event_type = ?`;
                params.push(eventType);
            }

            sql += ` ORDER BY created_at DESC LIMIT ?`;
            params.push(limit);

            this.database.db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    // 解析source_messages JSON
                    rows.forEach(row => {
                        try {
                            row.source_messages = JSON.parse(row.source_messages);
                        } catch (e) {
                            row.source_messages = [];
                        }
                    });
                    resolve(rows);
                }
            });
        });
    }

    /**
     * 将事件格式化为RSS项目
     */
    formatEventAsRSSItem(event) {
        const typeNames = {
            'todo': '待办事项',
            'notification': '通知',
            'entertainment': '文娱活动'
        };

        const typeName = typeNames[event.event_type] || event.event_type;
        const priorityEmoji = {
            'low': '🔵',
            'medium': '🟡', 
            'high': '🔴'
        };

        const emoji = priorityEmoji[event.priority] || '⚪';
        const title = `${emoji} [${typeName}] ${event.title}`;
        
        let description = `<h3>${event.title}</h3>`;
        description += `<p><strong>类型:</strong> ${typeName}</p>`;
        description += `<p><strong>优先级:</strong> ${event.priority}</p>`;
        description += `<p><strong>置信度:</strong> ${(event.confidence * 100).toFixed(1)}%</p>`;
        
        if (event.due_date) {
            const dueDate = new Date(event.due_date).toLocaleString('zh-CN');
            description += `<p><strong>截止时间:</strong> ${dueDate}</p>`;
        }
        
        description += `<p><strong>详细内容:</strong></p>`;
        description += `<p>${event.description.replace(/\n/g, '<br>')}</p>`;
        
        if (event.group_id) {
            description += `<p><strong>来源群聊:</strong> ${event.group_id}</p>`;
        }

        const item = {
            title: title,
            description: description,
            url: `${this.rssConfig.site_url}/events/${event.id}`,
            guid: `event_${event.id}`,
            date: new Date(event.created_at),
            categories: [typeName, event.priority],
            author: 'Listen2Me Bot'
        };

        // 如果有截止时间，添加到自定义元素
        if (event.due_date) {
            item.custom_elements = [
                { 'event:due_date': event.due_date },
                { 'event:priority': event.priority },
                { 'event:confidence': event.confidence },
                { 'event:type': event.event_type }
            ];
        }

        return item;
    }

    /**
     * 生成特定类型的RSS Feed
     */
    async generateTodoFeed() {
        return await this.generateFeed({ eventType: 'todo', limit: 30 });
    }

    async generateNotificationFeed() {
        return await this.generateFeed({ eventType: 'notification', limit: 30 });
    }

    async generateEntertainmentFeed() {
        return await this.generateFeed({ eventType: 'entertainment', limit: 30 });
    }

    /**
     * 获取RSS统计信息
     */
    async getRSSStats() {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    event_type,
                    COUNT(*) as count,
                    MAX(created_at) as latest_event
                FROM analyzed_events 
                WHERE status != 'completed'
                GROUP BY event_type
            `;

            this.database.db.all(sql, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    const stats = {
                        total_active_events: 0,
                        by_type: {},
                        last_updated: new Date().toISOString()
                    };

                    rows.forEach(row => {
                        stats.total_active_events += row.count;
                        stats.by_type[row.event_type] = {
                            count: row.count,
                            latest_event: row.latest_event
                        };
                    });

                    resolve(stats);
                }
            });
        });
    }
}

module.exports = RSSService;
