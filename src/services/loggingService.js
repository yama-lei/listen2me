const fs = require('fs');
const path = require('path');
const TimeUtils = require('../utils/timeUtils');

/**
 * 日志服务
 * 负责记录系统运行日志，包括消息、API响应、错误和AI请求
 */
class LoggingService {
    constructor(config) {
        this.config = config;
        this.logDir = path.join(process.cwd(), 'logs');
        this.ensureLogDirectory();
        
        // 日志文件路径
        this.logFiles = {
            messages: path.join(this.logDir, 'messages.log'),
            api: path.join(this.logDir, 'api.log'),
            errors: path.join(this.logDir, 'errors.log'),
            ai: path.join(this.logDir, 'ai.log'),
            system: path.join(this.logDir, 'system.log')
        };
    }

    /**
     * 确保日志目录存在
     */
    ensureLogDirectory() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
            console.log(`创建日志目录: ${this.logDir}`);
        }
    }

    /**
     * 写入日志文件
     * @param {string} logType 日志类型
     * @param {Object} data 日志数据
     */
    writeLog(logType, data) {
        try {
            const logFile = this.logFiles[logType];
            if (!logFile) {
                console.error(`未知的日志类型: ${logType}`);
                return;
            }

            const timestamp = TimeUtils.getBeijingTimeString();
            const logEntry = {
                timestamp,
                ...data
            };

            const logLine = JSON.stringify(logEntry) + '\n';
            fs.appendFileSync(logFile, logLine, 'utf8');
        } catch (error) {
            console.error(`写入日志失败 (${logType}):`, error);
        }
    }

    /**
     * 记录消息日志
     * @param {Object} messageData 消息数据
     * @param {string} action 动作 (received, processed, ignored)
     */
    logMessage(messageData, action = 'received') {
        const logData = {
            action,
            group_id: messageData.group_id,
            group_name: messageData.group_name,
            user_id: messageData.user_id,
            sender_nickname: messageData.sender_nickname,
            sender_role: messageData.sender_role,
            message_content: messageData.message_content?.substring(0, 200), // 限制长度
            message_length: messageData.message_content?.length || 0,
            is_admin_message: messageData.is_admin_message,
            timestamp: messageData.timestamp
        };

        this.writeLog('messages', logData);
    }

    /**
     * 记录API响应日志
     * @param {Object} requestData 请求数据
     * @param {Object} responseData 响应数据
     * @param {number} duration 请求持续时间(ms)
     */
    logApiResponse(requestData, responseData, duration) {
        const logData = {
            method: requestData.method || 'POST',
            url: requestData.url,
            status: responseData.status,
            retcode: responseData.retcode,
            success: responseData.status === 'ok',
            duration_ms: duration,
            request_size: JSON.stringify(requestData).length,
            response_size: JSON.stringify(responseData).length,
            echo: responseData.echo
        };

        this.writeLog('api', logData);
    }

    /**
     * 记录错误日志
     * @param {Error|string} error 错误对象或错误消息
     * @param {Object} context 错误上下文
     */
    logError(error, context = {}) {
        const logData = {
            error_message: error.message || error,
            error_stack: error.stack || null,
            error_type: error.constructor?.name || 'Unknown',
            context
        };

        this.writeLog('errors', logData);
    }

    /**
     * 记录AI请求日志
     * @param {Object} requestData 完整的AI请求数据
     * @param {Object} responseData AI响应数据
     * @param {number} duration 请求持续时间(ms)
     * @param {Object} analysisContext 分析上下文
     */
    logAiRequest(requestData, responseData, duration, analysisContext = {}) {
        const logData = {
            model: requestData.model,
            temperature: requestData.temperature,
            max_tokens: requestData.max_tokens,
            request_messages: requestData.messages, // 完整的conversations
            response_content: responseData.choices?.[0]?.message?.content,
            response_usage: responseData.usage,
            duration_ms: duration,
            analysis_context: {
                message_count: analysisContext.messageCount || 0,
                group_id: analysisContext.groupId,
                group_name: analysisContext.groupName,
                message_ids: analysisContext.messageIds || []
            },
            success: !!responseData.choices?.[0]?.message?.content
        };

        this.writeLog('ai', logData);
    }

    /**
     * 记录系统日志
     * @param {string} level 日志级别 (info, warn, error)
     * @param {string} message 日志消息
     * @param {Object} data 额外数据
     */
    logSystem(level, message, data = {}) {
        const logData = {
            level,
            message,
            ...data
        };

        this.writeLog('system', logData);
    }

    /**
     * 获取日志文件信息
     * @returns {Object} 日志文件信息
     */
    getLogFilesInfo() {
        const info = {};
        
        Object.entries(this.logFiles).forEach(([type, filePath]) => {
            try {
                const stats = fs.statSync(filePath);
                info[type] = {
                    path: filePath,
                    size: stats.size,
                    last_modified: stats.mtime.toISOString(),
                    exists: true
                };
            } catch (error) {
                info[type] = {
                    path: filePath,
                    exists: false,
                    error: error.message
                };
            }
        });

        return info;
    }

    /**
     * 清理旧日志文件
     * @param {number} daysToKeep 保留天数
     */
    cleanOldLogs(daysToKeep = 30) {
        const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
        
        Object.entries(this.logFiles).forEach(([type, filePath]) => {
            try {
                const stats = fs.statSync(filePath);
                if (stats.mtime.getTime() < cutoffTime) {
                    fs.unlinkSync(filePath);
                    this.logSystem('info', `删除旧日志文件: ${type}`, { filePath });
                }
            } catch (error) {
                // 文件不存在或其他错误，忽略
            }
        });
    }

    /**
     * 获取日志统计信息
     * @returns {Object} 日志统计
     */
    getLogStats() {
        const stats = {
            total_files: Object.keys(this.logFiles).length,
            files_info: this.getLogFilesInfo(),
            total_size: 0
        };

        Object.values(stats.files_info).forEach(fileInfo => {
            if (fileInfo.exists) {
                stats.total_size += fileInfo.size;
            }
        });

        return stats;
    }
}

module.exports = LoggingService;
