const TimeUtils = require('../utils/timeUtils');

/**
 * 消息控制器
 * 处理来自WebSocket的OneBot 11事件
 */
class MessageController {
    constructor(database, messageFilter, loggingService, adminService) {
        this.database = database;
        this.messageFilter = messageFilter;
        this.loggingService = loggingService;
        this.adminService = adminService;
        this.processedCount = 0;
        this.totalReceived = 0;
    }

    /**
     * 处理OneBot 11事件
     * @param {Object} event OneBot 11事件对象
     */
    async handleEvent(event) {
        this.totalReceived++;
        
        try {
            // 记录接收到的事件
            console.log(`接收到事件: ${event.post_type} - ${event.message_type || 'N/A'}`);
            
            // 检查是否为管理员私聊消息
            if (this.adminService && this.adminService.isAdminMessage(event)) {
                console.log('检测到管理员私聊消息，交由管理员服务处理');
                return await this.adminService.handleAdminMessage(event);
            }

            // 检查是否应该处理该事件
            if (!this.messageFilter.shouldProcessEvent(event)) {
                // 记录被忽略的消息
                const messageData = this.messageFilter.transformEventToMessage(event);
                this.loggingService.logMessage(messageData, 'ignored');
                return { status: 'ignored' };
            }

            // 转换事件为数据库格式
            const messageData = this.messageFilter.transformEventToMessage(event);
            
            // 保存到数据库
            const messageId = await this.database.insertMessage(messageData);
            this.processedCount++;
            
            // 记录处理的消息
            this.loggingService.logMessage(messageData, 'processed');
            
            console.log(`消息已保存到数据库，ID: ${messageId}, 群聊: ${messageData.group_id}, 用户: ${messageData.user_id}`);
            console.log(`消息内容: ${messageData.message_content.substring(0, 100)}${messageData.message_content.length > 100 ? '...' : ''}`);
            
            // 更新统计信息
            await this.updateStats();
            
            // 检查是否为管理员消息或长消息
            const isAdminMessage = messageData.is_admin_message;
            const isLongMessage = this.messageFilter.isLongMessage(messageData.message_content);
            
            if (isAdminMessage) {
                console.log('检测到管理员消息，将优先处理');
            } else if (isLongMessage) {
                console.log('检测到长消息，将优先处理');
            }

            return { 
                status: 'processed',
                message_id: messageId,
                is_admin_message: isAdminMessage,
                is_long_message: isLongMessage
            };

        } catch (error) {
            console.error('处理事件失败:', error);
            
            // 记录错误日志
            this.loggingService.logError(error, {
                event_type: event.post_type,
                message_type: event.message_type,
                group_id: event.group_id,
                user_id: event.user_id
            });
            
            return { 
                status: 'error', 
                error: error.message 
            };
        }
    }

    /**
     * 更新系统统计信息
     */
    async updateStats() {
        try {
            await this.database.updateStat('total_messages_received', this.totalReceived);
            await this.database.updateStat('total_messages_processed', this.processedCount);
            await this.database.updateStat('last_message_time', TimeUtils.getBeijingTimeISO());
        } catch (error) {
            console.error('更新统计信息失败:', error);
        }
    }

    /**
     * 获取处理状态
     */
    getStatus() {
        return {
            total_received: this.totalReceived,
            total_processed: this.processedCount,
            processing_rate: this.totalReceived > 0 ? (this.processedCount / this.totalReceived * 100).toFixed(2) + '%' : '0%',
            listened_groups: Array.from(this.messageFilter.listenGroupIds)
        };
    }
}

module.exports = MessageController;
