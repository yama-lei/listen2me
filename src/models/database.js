const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
    constructor(dbPath) {
        // 确保数据目录存在
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        this.db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('数据库连接失败:', err.message);
            } else {
                console.log('数据库连接成功');
                this.initTables();
            }
        });
    }

    initTables() {
        // 群聊消息表
        this.db.run(`
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id INTEGER NOT NULL,
                post_type TEXT NOT NULL,
                message_type TEXT,
                sub_type TEXT,
                group_id INTEGER,
                user_id INTEGER NOT NULL,
                sender_nickname TEXT,
                sender_role TEXT,
                message_content TEXT NOT NULL,
                raw_message TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                processed BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // AI分析结果表（todo、通知、文娱活动等）
        this.db.run(`
            CREATE TABLE IF NOT EXISTS analyzed_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL, -- 'todo', 'notification', 'entertainment'
                title TEXT NOT NULL,
                description TEXT,
                content TEXT NOT NULL,
                source_messages TEXT NOT NULL, -- JSON array of message IDs
                group_id INTEGER,
                confidence REAL DEFAULT 0,
                due_date DATETIME,
                priority TEXT DEFAULT 'medium', -- 'low', 'medium', 'high'
                status TEXT DEFAULT 'active', -- 'active', 'completed', 'cancelled'
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 系统统计表
        this.db.run(`
            CREATE TABLE IF NOT EXISTS system_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stat_name TEXT UNIQUE NOT NULL,
                stat_value TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // AI分析任务记录表
        this.db.run(`
            CREATE TABLE IF NOT EXISTS analysis_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id TEXT UNIQUE NOT NULL,
                status TEXT NOT NULL, -- 'pending', 'running', 'completed', 'failed'
                message_count INTEGER DEFAULT 0,
                events_found INTEGER DEFAULT 0,
                error_message TEXT,
                started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                completed_at DATETIME
            )
        `);

        // 创建索引
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_messages_group_id ON messages(group_id)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_messages_processed ON messages(processed)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_events_type ON analyzed_events(event_type)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_events_created_at ON analyzed_events(created_at)`);
        
        console.log('数据库表初始化完成');
    }

    // 插入消息
    insertMessage(messageData) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO messages (
                    message_id, post_type, message_type, sub_type, 
                    group_id, user_id, sender_nickname, sender_role,
                    message_content, raw_message, timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            this.db.run(sql, [
                messageData.message_id,
                messageData.post_type,
                messageData.message_type,
                messageData.sub_type,
                messageData.group_id,
                messageData.user_id,
                messageData.sender_nickname,
                messageData.sender_role,
                messageData.message_content,
                messageData.raw_message,
                messageData.timestamp
            ], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    // 获取未处理的消息
    getUnprocessedMessages(limit = 50) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT * FROM messages 
                WHERE processed = 0 
                ORDER BY timestamp ASC 
                LIMIT ?
            `;
            
            this.db.all(sql, [limit], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // 标记消息为已处理
    markMessagesProcessed(messageIds) {
        return new Promise((resolve, reject) => {
            const placeholders = messageIds.map(() => '?').join(',');
            const sql = `UPDATE messages SET processed = 1 WHERE id IN (${placeholders})`;
            
            this.db.run(sql, messageIds, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    // 插入分析事件
    insertAnalyzedEvent(eventData) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO analyzed_events (
                    event_type, title, description, content,
                    source_messages, group_id, confidence, due_date, priority
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            this.db.run(sql, [
                eventData.event_type,
                eventData.title,
                eventData.description,
                eventData.content,
                JSON.stringify(eventData.source_messages),
                eventData.group_id,
                eventData.confidence,
                eventData.due_date,
                eventData.priority
            ], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    // 获取最近的事件
    getRecentEvents(limit = 50, eventType = null) {
        return new Promise((resolve, reject) => {
            let sql = `
                SELECT * FROM analyzed_events 
                WHERE status = 'active'
            `;
            const params = [];
            
            if (eventType) {
                sql += ` AND event_type = ?`;
                params.push(eventType);
            }
            
            sql += ` ORDER BY created_at DESC LIMIT ?`;
            params.push(limit);
            
            this.db.all(sql, params, (err, rows) => {
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

    // 更新统计信息
    updateStat(statName, statValue) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT OR REPLACE INTO system_stats (stat_name, stat_value, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
            `;
            
            this.db.run(sql, [statName, statValue.toString()], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    // 获取统计信息
    getStats() {
        return new Promise((resolve, reject) => {
            const sql = `SELECT stat_name, stat_value, updated_at FROM system_stats`;
            
            this.db.all(sql, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    const stats = {};
                    rows.forEach(row => {
                        stats[row.stat_name] = row.stat_value;
                    });
                    resolve(stats);
                }
            });
        });
    }

    // 记录分析任务
    recordAnalysisTask(taskId, status, messageCount = 0, eventsFound = 0, errorMessage = null) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT OR REPLACE INTO analysis_tasks (
                    task_id, status, message_count, events_found, error_message,
                    started_at, completed_at
                ) VALUES (?, ?, ?, ?, ?, 
                    COALESCE((SELECT started_at FROM analysis_tasks WHERE task_id = ?), CURRENT_TIMESTAMP),
                    CASE WHEN ? IN ('completed', 'failed') THEN CURRENT_TIMESTAMP ELSE NULL END
                )
            `;
            
            this.db.run(sql, [taskId, status, messageCount, eventsFound, errorMessage, taskId, status], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    // 关闭数据库连接
    close() {
        return new Promise((resolve) => {
            this.db.close((err) => {
                if (err) {
                    console.error('关闭数据库连接失败:', err.message);
                } else {
                    console.log('数据库连接已关闭');
                }
                resolve();
            });
        });
    }
}

module.exports = Database;
