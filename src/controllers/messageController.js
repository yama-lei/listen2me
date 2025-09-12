/**
 * 消息控制器
 * 处理来自WebSocket的OneBot 11事件
 */
class MessageController {
    constructor(database, messageFilter) {
        this.database = database;
        this.messageFilter = messageFilter;
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
            
            // 检查是否应该处理该事件
            if (!this.messageFilter.shouldProcessEvent(event)) {
                return { status: 'ignored' };
            }

            // 转换事件为数据库格式
            const messageData = this.messageFilter.transformEventToMessage(event);
            
            // 保存到数据库
            const messageId = await this.database.insertMessage(messageData);
            this.processedCount++;
            
            console.log(`消息已保存到数据库，ID: ${messageId}, 群聊: ${messageData.group_id}, 用户: ${messageData.user_id}`);
            console.log(`消息内容: ${messageData.message_content.substring(0, 100)}${messageData.message_content.length > 100 ? '...' : ''}`);
            
            // 更新统计信息
            await this.updateStats();
            
            // 分析消息潜在价值
            const potential = this.messageFilter.analyzeMessagePotential(messageData.message_content);
            if (potential.has_potential) {
                console.log('消息具有分析价值:', potential);
            }

            return { 
                status: 'processed',
                message_id: messageId
            };

        } catch (error) {
            console.error('处理事件失败:', error);
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
            await this.database.updateStat('last_message_time', new Date().toISOString());
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
