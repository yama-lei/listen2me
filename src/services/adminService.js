const axios = require('axios');
const TimeUtils = require('../utils/timeUtils');

/**
 * 管理员服务
 * 处理管理员私聊消息的接收和发送
 */
class AdminService {
    constructor(config, database, aiAnalysisService, loggingService, websocketService) {
        this.config = config;
        this.database = database;
        this.aiAnalysisService = aiAnalysisService;
        this.loggingService = loggingService;
        this.websocketService = websocketService;
        
        // 解析管理员账号ID列表
        this.adminIds = this.parseAdminIds(config.ADMIN_IDS || config.ADMIN_ID);
        
        console.log(`管理员服务初始化完成，管理员IDs: [${this.adminIds.join(', ')}]`);
    }

    /**
     * 解析管理员ID列表
     * @param {string} adminIdsConfig 管理员ID配置字符串
     * @returns {number[]} 管理员ID数组
     */
    parseAdminIds(adminIdsConfig) {
        if (!adminIdsConfig) {
            return [];
        }
        
        return adminIdsConfig.toString().split(',')
            .map(id => parseInt(id.trim()))
            .filter(id => !isNaN(id) && id > 0);
    }

    /**
     * 检查是否为管理员消息
     * @param {Object} event 消息事件
     * @returns {boolean} 是否为管理员消息
     */
    isAdminMessage(event) {
        // 必须是私聊消息
        if (event.message_type !== 'private') {
            return false;
        }
        
        // 必须有用户ID
        if (!event.user_id) {
            return false;
        }
        
        // 检查是否在管理员ID列表中
        const userId = parseInt(event.user_id);
        return this.adminIds.includes(userId);
    }

    /**
     * 处理管理员私聊消息
     * @param {Object} event 消息事件
     */
    async handleAdminMessage(event) {
        if (!this.isAdminMessage(event)) {
            return { status: 'ignored', reason: 'not_admin_message' };
        }

        try {
            console.log(`收到管理员私聊消息: ${event.user_id}`);
            
            const messageText = this.extractMessageText(event);
            
            // 记录管理员消息日志
            this.loggingService.logMessage({
                group_id: null,
                group_name: 'private_admin',
                user_id: event.user_id,
                sender_nickname: event.sender?.nickname || '管理员',
                sender_role: 'admin',
                message_content: messageText,
                raw_message: event.raw_message || JSON.stringify(event.message),
                timestamp: event.time,
                is_admin_message: true
            }, 'admin_received');

            // 检查是否为命令
            if (this.isCommand(messageText)) {
                return await this.handleAdminCommand(messageText);
            }

            // 检查是否为add指令
            if (this.isAddCommand(messageText)) {
                return await this.handleAddCommand(messageText);
            }

            // 对于其他消息，只记录日志，不进行AI分析，也不保存到未处理队列
            console.log(`管理员发送了非指令消息，已记录日志但不进行分析: ${messageText.substring(0, 50)}...`);
            
            return { 
                status: 'logged_only', 
                reason: 'non_command_message'
            };

        } catch (error) {
            console.error('处理管理员消息失败:', error);
            this.loggingService.logError(error, {
                context: 'admin_message_processing',
                user_id: event.user_id
            });
            
            // 发送错误消息给管理员
            await this.sendMessageToAdmin(`处理消息时发生错误: ${error.message}`);
            
            return { status: 'error', error: error.message };
        }
    }

    /**
     * 检查是否为命令
     * @param {string} messageText 消息文本
     * @returns {boolean} 是否为命令
     */
    deleteCommandList = ['del', '/del','delete','/delete','rm'];
    helpCommandList = ['help', '/help'];
    allCommandList = ['all', '/all','ls'];
    addCommandList = ['add', '/add'];
    commandList = [...this.deleteCommandList, ...this.helpCommandList, ...this.allCommandList, ...this.addCommandList];

    isCommand(messageText) {
        const trimmedText = messageText.trim().toLowerCase();
        // 检查完整命令匹配
        if (this.commandList.includes(trimmedText)) {
            return true;
        }
        // 检查带参数的命令
        const firstWord = trimmedText.split(' ')[0];
        return this.commandList.includes(firstWord);
    }

    /**
     * 处理管理员命令
     * @param {string} command 命令文本
     * @returns {Promise<Object>} 处理结果
     */
    async handleAdminCommand(command) {
        const trimmedCommand = command.trim().toLowerCase();
        const [cmd, ...args] = trimmedCommand.split(' ');

        // 处理查看全部事件命令
        if (this.allCommandList.includes(cmd)) {
            return await this.handleListAllEventsCommand();
        }

        // 处理删除事件命令
        if (this.deleteCommandList.includes(cmd)) {
            if (!args[0]) {
                await this.sendMessageToAdmin('请指定要删除的事件ID，格式: 删除 [事件ID]');
                return { status: 'processed', command: 'delete_help' };
            }
            return await this.handleDeleteEventCommand(args[0]);
        }

        // 处理帮助命令
        if (this.helpCommandList.includes(cmd)) {
            const helpMessage = [
                '📋 可用命令列表:',
                '1. 查看全部事件: /all, all, ls',
                '2. 删除事件: /del [事件ID], rm [事件ID]',
                '3. 添加事件: /add [内容], add [内容]',
                '4. 帮助信息: /help, help'
            ].join('\n');
            await this.sendMessageToAdmin(helpMessage);
            return { status: 'processed', command: 'help' };
        }
        if(this.isAddCommand(trimmedCommand)) {
            return await this.handleAddCommand(trimmedCommand);
        }
        // 处理未知命令
        await this.sendMessageToAdmin(`❌ 未知命令: ${command}\n使用 /help 查看可用命令`);
        return { status: 'processed', command: 'unknown' };
    }

    /**
     * 检查是否为add指令
     * @param {string} messageText 消息文本
     * @returns {boolean} 是否为add指令
     */
    isAddCommand(messageText) {
        const trimmedText = messageText.trim().toLowerCase();
        const firstWord = trimmedText.split(' ')[0];
        return this.addCommandList.includes(firstWord);
    }

    /**
     * 处理add指令
     * @param {string} messageText 消息文本
     * @returns {Promise<Object>} 处理结果
     */
    async handleAddCommand(messageText) {
        const trimmedText = messageText.trim();
        const parts = trimmedText.split(' ');
        
        // 移除第一个命令词
        parts.shift();
        const content = parts.join(' ').trim();
        
        if (!content) {
            await this.sendMessageToAdmin('❌ 请在add指令后添加内容，格式: add [内容]');
            return { status: 'processed', command: 'add', success: false, reason: 'empty_content' };
        }

        try {
            // 构建模拟事件对象用于AI分析
            const mockEvent = {
                message_id: Date.now(), // 使用时间戳作为临时ID
                user_id: this.adminIds[0], // 使用第一个管理员ID
                message_type: 'private',
                raw_message: content,
                message: content,
                time: Math.floor(Date.now() / 1000),
                sender: {
                    nickname: '管理员'
                }
            };

            // 分析管理员消息
            const analysisResult = await this.analyzeAdminMessage(mockEvent);
            
            // 发送分析结果给管理员
            if (analysisResult.events && analysisResult.events.length > 0) {
                await this.sendAnalysisResultToAdmin(analysisResult);
                return { 
                    status: 'processed', 
                    command: 'add',
                    success: true,
                    events_found: analysisResult.events.length 
                };
            } else {
                await this.sendMessageToAdmin('没有识别到任何待办事项、通知或活动。');
                return { 
                    status: 'processed', 
                    command: 'add',
                    success: false,
                    reason: 'no_events_found' 
                };
            }

        } catch (error) {
            console.error('处理add指令失败:', error);
            await this.sendMessageToAdmin(`处理add指令时发生错误: ${error.message}`);
            return { status: 'error', command: 'add', error: error.message };
        }
    }

    /**
     * 处理列出所有事件的命令
     */
    async handleListAllEventsCommand() {
        try {
            // 获取所有活跃事件
            const events = await this.database.getRecentEvents(100, null, false);
            
            if (events.length === 0) {
                await this.sendMessageToAdmin('📋 当前没有任何活跃的任务或事件。');
                return { status: 'processed', command: 'list_all', events_count: 0 };
            }

            let message = `📋 当前所有任务和事件 (${TimeUtils.getBeijingTimeString()}):\n\n`;
            
            // 按类型分组
            const eventsByType = {
                'todo': [],
                'notification': [],
                'entertainment': []
            };
            
            events.forEach(event => {
                if (eventsByType[event.event_type]) {
                    eventsByType[event.event_type].push(event);
                }
            });

            // 显示待办事项
            if (eventsByType.todo.length > 0) {
                message += `📝 待办事项 (${eventsByType.todo.length}个):\n`;
                eventsByType.todo.forEach((event, index) => {
                    message += `[ID:${event.id}] ${event.title}\n`;
                    if (event.due_date) {
                        const dueDate = new Date(event.due_date);
                        const dueDateStr = TimeUtils.timestampToBeijingString(Math.floor(dueDate.getTime() / 1000));
                        message += `   截止: ${dueDateStr}\n`;
                    }
                    message += `   优先级: ${this.getPriorityName(event.priority)}\n\n`;
                });
            }

            // 显示通知
            if (eventsByType.notification.length > 0) {
                message += `📢 通知 (${eventsByType.notification.length}个):\n`;
                eventsByType.notification.forEach((event, index) => {
                    message += `${index + 1}. [ID:${event.id}] ${event.title}\n`;
                    if (event.due_date) {
                        const dueDate = new Date(event.due_date);
                        const dueDateStr = TimeUtils.timestampToBeijingString(Math.floor(dueDate.getTime() / 1000));
                        message += `   截止: ${dueDateStr}\n`;
                    }
                    message += `   优先级: ${this.getPriorityName(event.priority)}\n\n`;
                });
            }

            // 显示文娱活动
            if (eventsByType.entertainment.length > 0) {
                message += `🎉 文娱活动 (${eventsByType.entertainment.length}个):\n`;
                eventsByType.entertainment.forEach((event, index) => {
                    message += `${index + 1}. [ID:${event.id}] ${event.title}\n`;
                    if (event.due_date) {
                        const dueDate = new Date(event.due_date);
                        const dueDateStr = TimeUtils.timestampToBeijingString(Math.floor(dueDate.getTime() / 1000));
                        message += `   时间: ${dueDateStr}\n`;
                    }
                    message += `   优先级: ${this.getPriorityName(event.priority)}\n\n`;
                });
            }

            message += `\n💡 提示: 发送 "del [事件ID]" 可以删除指定事件`;

            await this.sendMessageToAdmin(message);
            return { status: 'processed', command: 'list_all', events_count: events.length };

        } catch (error) {
            console.error('获取所有事件失败:', error);
            await this.sendMessageToAdmin('获取事件列表时发生错误，请稍后重试。');
            return { status: 'error', command: 'list_all', error: error.message };
        }
    }

    /**
     * 处理删除事件命令
     * @param {string} eventId 事件ID
     */
    async handleDeleteEventCommand(eventId) {
        try {
            if (!eventId || isNaN(parseInt(eventId))) {
                await this.sendMessageToAdmin('❌ 无效的事件ID，请输入数字ID');
                return { status: 'processed', command: 'delete', success: false, reason: 'invalid_id' };
            }

            const id = parseInt(eventId);
            
            // 检查事件是否存在
            const events = await this.database.getRecentEvents(1000, null, true);
            const event = events.find(e => e.id === id);
            
            if (!event) {
                await this.sendMessageToAdmin(`❌ 未找到ID为 ${id} 的事件`);
                return { status: 'processed', command: 'delete', success: false, reason: 'not_found' };
            }

            // 删除事件
            const success = await this.database.deleteEvent(id);
            
            if (success) {
                const typeEmoji = this.getEventTypeEmoji(event.event_type);
                await this.sendMessageToAdmin(`✅ 已删除事件: ${typeEmoji} ${event.title}`);
                return { status: 'processed', command: 'delete', success: true, event_id: id };
            } else {
                await this.sendMessageToAdmin(`❌ 删除事件失败，请稍后重试`);
                return { status: 'processed', command: 'delete', success: false, reason: 'delete_failed' };
            }

        } catch (error) {
            console.error('删除事件失败:', error);
            await this.sendMessageToAdmin('❌ 删除事件时发生错误，请稍后重试');
            return { status: 'error', command: 'delete', error: error.message };
        }
    }

    /**
     * 分析管理员消息
     * @param {Object} event 消息事件
     */
    async analyzeAdminMessage(event) {
        const messageText = this.extractMessageText(event);
        
        // 构建分析上下文
        const context = this.buildAdminAnalysisContext(messageText);
        
        // 调用AI分析
        const analysisContext = {
            messageCount: 1,
            groupId: 'admin_private',
            groupName: '管理员私聊',
            messageIds: [event.message_id],
            isAdminMessage: true
        };

        const analysis = await this.aiAnalysisService.callLLM(context, analysisContext);
        
        // 解析分析结果
        const events = this.aiAnalysisService.parseAnalysisResult(analysis, 'admin_private', [{
            id: event.message_id,
            group_name: '管理员私聊',
            message_content: messageText
        }]);

        // 保存分析结果到数据库
        for (const event of events) {
            await this.database.insertAnalyzedEvent(event);
        }

        return { events };
    }

    /**
     * 构建管理员消息分析上下文
     * @param {string} messageText 消息文本
     */
    buildAdminAnalysisContext(messageText) {
        return `以下是管理员发送的消息内容：

<待分析消息>
管理员 于 ${TimeUtils.getBeijingTimeString()} 发送了消息: ${messageText}
</待分析消息>

请分析这条消息，识别其中可能包含的待办事项、通知或文娱活动。`;
    }

    /**
     * 提取消息文本
     * @param {Object} event 消息事件
     * @returns {string} 消息文本
     */
    extractMessageText(event) {
        // 如果有raw_message，优先使用
        if (event.raw_message) {
            return event.raw_message;
        }

        // 如果message是字符串，直接使用
        if (typeof event.message === 'string') {
            return event.message;
        }

        // 如果message是数组（消息段），提取文本部分
        if (Array.isArray(event.message)) {
            let text = '';
            for (const segment of event.message) {
                if (segment.type === 'text' && segment.data && segment.data.text) {
                    text += segment.data.text;
                }
            }
            return text;
        }

        return '';
    }

    /**
     * 发送消息给管理员
     * @param {string} message 消息内容
     * @param {number} targetAdminId 目标管理员ID，如果不指定则发送给第一个管理员
     */
    async sendMessageToAdmin(message, targetAdminId = null) {
        if (this.adminIds.length === 0) {
            console.warn('未配置管理员ID，无法发送消息');
            return false;
        }

        if (!this.websocketService) {
            console.warn('WebSocket服务未初始化，无法发送消息');
            return false;
        }

        // 确定目标管理员ID
        const adminId = targetAdminId || this.adminIds[0];

        try {
            // 构建发送私聊消息的请求
            const requestData = {
                action: 'send_private_msg',
                params: {
                    user_id: adminId.toString(),
                    message: [
                        {
                            type: 'text',
                            data: {
                                text: message
                            }
                        }
                    ]
                }
            };

            // 通过WebSocket发送消息
            const success = this.websocketService.broadcastToClients(requestData);
            
            if (success > 0) {
                console.log(`消息已发送给管理员 ${adminId}: ${message.substring(0, 50)}...`);
                return true;
            } else {
                console.warn('没有可用的WebSocket连接发送消息');
                return false;
            }

        } catch (error) {
            console.error('发送消息给管理员失败:', error);
            this.loggingService.logError(error, {
                context: 'send_message_to_admin',
                admin_id: adminId,
                message: message.substring(0, 100)
            });
            return false;
        }
    }

    /**
     * 发送分析结果给管理员
     * @param {Object} analysisResult 分析结果
     */
    async sendAnalysisResultToAdmin(analysisResult) {
        const events = analysisResult.events || [];
        
        if (events.length === 0) {
            await this.sendMessageToAdmin('没有识别到任何待办事项、通知或活动。');
            return;
        }

        let message = `📋 分析结果 (${TimeUtils.getBeijingTimeString()}):\n\n`;
        
        events.forEach((event, index) => {
            const typeEmoji = this.getEventTypeEmoji(event.event_type);
            const priorityEmoji = this.getPriorityEmoji(event.priority);
            
            message += `${index + 1}. ${typeEmoji} ${event.title}\n`;
            message += `   类型: ${this.getEventTypeName(event.event_type)}\n`;
            message += `   优先级: ${priorityEmoji} ${this.getPriorityName(event.priority)}\n`;
            
            if (event.due_date) {
                const dueDate = new Date(event.due_date);
                const dueDateStr = TimeUtils.timestampToBeijingString(Math.floor(dueDate.getTime() / 1000));
                message += `   截止时间: ${dueDateStr}\n`;
            }
            
            message += `   描述: ${event.description}\n\n`;
        });

        message += `✅ 已自动保存到系统中，可通过RSS或API查看。`;

        await this.sendMessageToAdmin(message);
    }

    /**
     * 获取事件类型表情符号
     * @param {string} eventType 事件类型
     * @returns {string} 表情符号
     */
    getEventTypeEmoji(eventType) {
        const emojiMap = {
            'todo': '📝',
            'notification': '📢',
            'entertainment': '🎉'
        };
        return emojiMap[eventType] || '📋';
    }

    /**
     * 获取优先级表情符号
     * @param {string} priority 优先级
     * @returns {string} 表情符号
     */
    getPriorityEmoji(priority) {
        const emojiMap = {
            'low': '🟢',
            'medium': '🟡',
            'high': '🔴'
        };
        return emojiMap[priority] || '🟡';
    }

    /**
     * 获取事件类型名称
     * @param {string} eventType 事件类型
     * @returns {string} 类型名称
     */
    getEventTypeName(eventType) {
        const nameMap = {
            'todo': '待办事项',
            'notification': '通知',
            'entertainment': '文娱活动'
        };
        return nameMap[eventType] || eventType;
    }

    /**
     * 获取优先级名称
     * @param {string} priority 优先级
     * @returns {string} 优先级名称
     */
    getPriorityName(priority) {
        const nameMap = {
            'low': '低',
            'medium': '中',
            'high': '高'
        };
        return nameMap[priority] || '中';
    }


    /**
     * 获取管理员服务状态
     * @returns {Object} 服务状态
     */
    getStatus() {
        return {
            admin_ids: this.adminIds,
            admin_count: this.adminIds.length,
            websocket_available: !!this.websocketService,
            service_enabled: this.adminIds.length > 0
        };
    }
}

module.exports = AdminService;
