/**
 * 消息过滤服务
 * 负责根据配置过滤和处理OneBot 11消息事件
 */
class MessageFilter {
    constructor(config) {
        // 从配置中获取要监听的群聊ID列表
        this.listenGroupIds = new Set(
            config.LISTEN_GROUP_IDS
                .split(',')
                .map(id => parseInt(id.trim()))
                .filter(id => !isNaN(id))
        );
        
        console.log('监听群聊ID:', Array.from(this.listenGroupIds));
    }

    /**
     * 检查是否应该处理该事件
     * @param {Object} event OneBot 11事件对象
     * @returns {boolean} 是否应该处理
     */
    shouldProcessEvent(event) {
        // 基础字段验证
        if (!event || !event.post_type || !event.self_id) {
            console.log('事件缺少基础字段，跳过处理');
            return false;
        }

        // 只处理消息事件
        if (event.post_type !== 'message' && event.post_type !== 'message_sent') {
            console.log(`跳过非消息事件: ${event.post_type}`);
            return false;
        }

        // 只处理群消息
        if (event.message_type !== 'group') {
            console.log(`跳过非群消息: ${event.message_type}`);
            return false;
        }

        // 检查是否在监听的群聊中
        if (!this.listenGroupIds.has(event.group_id)) {
            console.log(`群聊 ${event.group_id} 不在监听列表中，跳过`);
            return false;
        }

        // 检查消息内容
        if (!event.message || (!event.raw_message && !event.message)) {
            console.log('消息内容为空，跳过');
            return false;
        }

        return true;
    }

    /**
     * 提取消息文本内容
     * @param {Object} event OneBot 11消息事件
     * @returns {string} 纯文本消息内容
     */
    extractMessageText(event) {
        // 如果有raw_message，优先使用
        if (event.raw_message) {
            return this.cleanMessage(event.raw_message);
        }

        // 如果message是字符串，直接使用
        if (typeof event.message === 'string') {
            return this.cleanMessage(event.message);
        }

        // 如果message是数组（消息段），提取文本部分
        if (Array.isArray(event.message)) {
            let text = '';
            for (const segment of event.message) {
                if (segment.type === 'text' && segment.data && segment.data.text) {
                    text += segment.data.text;
                }
                // 可以考虑处理其他类型的段，如at、图片等
                else if (segment.type === 'at' && segment.data && segment.data.qq) {
                    text += `@${segment.data.qq} `;
                }
            }
            return this.cleanMessage(text);
        }

        return '';
    }

    /**
     * 清理消息文本
     * @param {string} text 原始消息文本
     * @returns {string} 清理后的文本
     */
    cleanMessage(text) {
        if (!text) return '';
        
        return text
            .replace(/\\r\\n|\\n|\\r/g, ' ') // 替换换行符
            .replace(/\s+/g, ' ') // 合并多个空格
            .trim();
    }

    /**
     * 检查发送者是否为管理员或群主
     * @param {Object} event OneBot 11事件
     * @returns {boolean} 是否为管理员或群主
     */
    isAdminOrOwner(event) {
        const role = event.sender?.role;
        return role === 'admin' || role === 'owner';
    }

    /**
     * 将OneBot事件转换为数据库存储格式
     * @param {Object} event OneBot 11事件
     * @returns {Object} 数据库存储格式的消息对象
     */
    transformEventToMessage(event) {
        const messageText = this.extractMessageText(event);
        const isAdmin = this.isAdminOrOwner(event);
        
        return {
            message_id: event.message_id,
            post_type: event.post_type,
            message_type: event.message_type,
            sub_type: event.sub_type || null,
            group_id: event.group_id,
            group_name: event.peerName || event.group_name || null,
            user_id: event.user_id,
            sender_nickname: event.sender?.nickname || null,
            sender_role: event.sender?.role || null,
            message_content: messageText,
            raw_message: event.raw_message || JSON.stringify(event.message),
            timestamp: event.time,
            is_admin_message: isAdmin
        };
    }

    /**
     * 检查消息长度是否超过阈值
     * @param {string} messageText 消息文本
     * @returns {boolean} 是否超过长度阈值
     */
    isLongMessage(messageText) {
        return messageText && messageText.length > 50;
    }
}

module.exports = MessageFilter;
