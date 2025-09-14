const axios = require('axios');
const crypto = require('crypto');
const TimeUtils = require('../utils/timeUtils');

// 简单的UUID生成函数
function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * AI分析服务
 * 负责调用LLM分析消息并识别todo、通知、文娱活动等
 */
class AIAnalysisService {
    constructor(config, database, loggingService) {
        this.config = {
            apiBase: config.OPENAI_API_BASE || 'https://api.openai.com/v1',
            apiKey: config.OPENAI_API_KEY,
            model: config.OPENAI_MODEL || 'gpt-3.5-turbo',
            maxMessagesPerAnalysis: parseInt(config.AI_MAX_MESSAGES_PER_ANALYSIS) || 50,
            contextWindowHours: parseInt(config.AI_CONTEXT_WINDOW_HOURS) || 2,
            longMessageThreshold: parseInt(config.AI_LONG_MESSAGE_THRESHOLD) || 50,
            shortMessageBatchSize: parseInt(config.AI_SHORT_MESSAGE_BATCH_SIZE) || 10
        };
        
        this.database = database;
        this.loggingService = loggingService;
        
        // 验证配置
        if (!this.config.apiKey) {
            console.warn('警告: 未配置OPENAI_API_KEY，AI分析功能将无法使用');
        }
        
        // 根据MessAgeType文件的内容定义支持的消息类型
        this.supportedEventTypes = {
            'todo': '待办事项',
            'notification': '通知',
            'entertainment': '文娱活动'
        };
    }

    /**
     * 分析未处理的消息
     * @returns {Promise<Object>} 分析结果
     */
    async analyzeMessages() {
        const taskId = uuidv4();
        
        try {
            console.log(`开始AI分析任务: ${taskId}`);
            await this.database.recordAnalysisTask(taskId, 'running');

            // 获取未处理的消息
            const messages = await this.database.getUnprocessedMessages(this.config.maxMessagesPerAnalysis);
            
            if (messages.length === 0) {
                console.log('没有未处理的消息，跳过分析');
                await this.database.recordAnalysisTask(taskId, 'completed', 0, 0);
                return { processed: 0, events: [] };
            }

            console.log(`获取到 ${messages.length} 条未处理消息`);

            // 按群聊分组分析
            const messagesByGroup = this.groupMessagesByGroup(messages);
            const allEvents = [];
            const processedMessageIds = [];

            for (const [groupId, groupMessages] of Object.entries(messagesByGroup)) {
                console.log(`分析群聊 ${groupId} 的 ${groupMessages.length} 条消息`);
                const groupHistoryMessages = await this.database.getGroupHistoryMessages(groupId);
                const { events, processedIds } = await this.analyzeGroupMessagesWithStrategy(groupId, groupMessages, groupHistoryMessages);
                allEvents.push(...events);
                processedMessageIds.push(...processedIds);
            }

            // 保存分析结果
            for (const event of allEvents) {
                await this.database.insertAnalyzedEvent(event);
            }

            // 标记消息为已处理
            await this.database.markMessagesProcessed(processedMessageIds);

            // 更新分析任务状态
            await this.database.recordAnalysisTask(taskId, 'completed', processedMessageIds.length, allEvents.length);
            
            // 更新统计信息
            await this.database.updateStat('last_analysis_time', TimeUtils.getBeijingTimeISO());
            await this.database.updateStat('total_events_found', allEvents.length);

            console.log(`AI分析完成: 处理 ${processedMessageIds.length} 条消息，识别 ${allEvents.length} 个事件`);
            
            return {
                taskId,
                processed: processedMessageIds.length,
                events: allEvents
            };

        } catch (error) {
            console.error('AI分析失败:', error);
            await this.database.recordAnalysisTask(taskId, 'failed', 0, 0, error.message);
            throw error;
        }
    }

    /**
     * 按群聊分组消息
     */
    groupMessagesByGroup(messages) {
        const groups = {};
        messages.forEach(message => {
            const groupId = message.group_id || 'private';
            if (!groups[groupId]) {
                groups[groupId] = [];
            }
            groups[groupId].push(message);
        });
        return groups;
    }

    /**
     * 使用新策略分析群聊消息
     */
    async analyzeGroupMessagesWithStrategy(groupId, messages, groupHistoryMessages) {
        if (!this.config.apiKey) {
            console.warn('未配置API密钥，跳过AI分析');
            return { events: [], processedIds: [] };
        }

        const allEvents = [];
        const processedIds = [];
        
        // 按时间排序消息
        const sortedMessages = messages.sort((a, b) => a.timestamp - b.timestamp);
        
        // 分离长消息和短消息
        const longMessages = [];
        const shortMessages = [];
        
        for (const message of sortedMessages) {
            if (message.is_admin_message || this.isLongMessage(message.message_content)) {
                longMessages.push(message);
            } else {
                shortMessages.push(message);
            }
        }
        
        // 处理长消息（包括管理员消息）- 立即分析
        for (const message of longMessages) {
            try {
                console.log(`立即分析长消息/管理员消息: ${message.id}`);
                const events = await this.analyzeGroupMessages(groupId, [message], groupHistoryMessages);
                allEvents.push(...events);
                processedIds.push(message.id);
            } catch (error) {
                console.error(`分析长消息失败:`, error);
                processedIds.push(message.id); // 即使失败也标记为已处理
            }
        }
        
        // 处理短消息 - 批量分析
        if (shortMessages.length > 0) {
            const batches = this.createBatches(shortMessages, this.config.shortMessageBatchSize);
            
            for (const batch of batches) {
                try {
                    console.log(`批量分析短消息: ${batch.length} 条`);
                    const events = await this.analyzeGroupMessages(groupId, batch, groupHistoryMessages);
                    allEvents.push(...events);
                    processedIds.push(...batch.map(m => m.id));
                } catch (error) {
                    console.error(`批量分析短消息失败:`, error);
                    processedIds.push(...batch.map(m => m.id)); // 即使失败也标记为已处理
                }
            }
        }
        
        return { events: allEvents, processedIds };
    }

    /**
     * 检查是否为长消息
     */
    isLongMessage(messageContent) {
        return messageContent && messageContent.length > this.config.longMessageThreshold;
    }

    /**
     * 创建消息批次
     */
    createBatches(messages, batchSize) {
        const batches = [];
        for (let i = 0; i < messages.length; i += batchSize) {
            batches.push(messages.slice(i, i + batchSize));
        }
        return batches;
    }

    /**
     * 分析特定群聊的消息
     */
    async analyzeGroupMessages(groupId, messages, groupHistoryMessages) {
        if (!this.config.apiKey) {
            console.warn('未配置API密钥，跳过AI分析');
            return [];
        }

        try {
            // 构建上下文
            const context = this.buildAnalysisContext(messages, groupHistoryMessages);
            
            // 调用LLM分析
            const analysisContext = {
                messageCount: messages.length,
                groupId: groupId,
                groupName: messages.length > 0 ? messages[0].group_name : null,
                messageIds: messages.map(m => m.id)
            };
            const analysis = await this.callLLM(context, analysisContext);
            
            // 解析分析结果
            const events = this.parseAnalysisResult(analysis, groupId, messages);
            
            return events;
        } catch (error) {
            console.error(`分析群聊 ${groupId} 消息失败:`, error);
            return [];
        }
    }

    /**
     * 构建分析上下文
     */
    buildAnalysisContext(messages, groupHistoryMessages) {
        const sortedMessages = messages.sort((a, b) => a.timestamp - b.timestamp);
        const sortedGroupHistoryMessages = groupHistoryMessages.sort((a, b) => a.timestamp - b.timestamp);
        let context = '以下是最近的群聊消息记录：\n\n';
        context += `<待分析消息>`;
        
        sortedMessages.forEach((message, index) => {
            const time = TimeUtils.timestampToBeijingString(message.timestamp);
            const nickname = message.sender_nickname || `用户${message.user_id}`;
            //context += `[${time}] ${nickname}: ${message.message_content}\n`;
            context += `${nickname} 于 ${time} 发送了消息: ${message.message_content}\n`;
        });
        context += `</待分析消息>`;
        context += `<历史消息>`;

        sortedGroupHistoryMessages.forEach((message, index) => {
            const time = TimeUtils.timestampToBeijingString(message.timestamp);
            const nickname = message.sender_nickname || `用户${message.user_id}`;
            context += `${nickname} 于 ${time} 发送了消息: ${message.message_content}\n`;
        });
        context += `</历史消息>`;

        return context;
    }


    /**
     * 调用LLM进行分析
     */
    async callLLM(context, analysisContext = {}) {
        const systemPrompt = `
<task>
  <role>
    你是一个智能助手，专门分析群聊消息并识别其中的待办事项、通知和文娱活动。
  </role>

  <responsibilities>
    <item>仔细分析群聊消息内容</item>
    <item>识别其中的待办事项 (todo)、通知 (notification)、文娱活动 (entertainment)</item>
    <item>提取关键信息，如截止时间、优先级</item>
    <item>以结构化的 JSON 格式返回结果</item>
  </responsibilities>

  <rules>
    <item>一个完整的事情必须只写成一个事件，不要拆分成多个</item>
    <item>如果消息中没有明确的事件，请返回空数组</item>
    <item>不要为了填充而强行创建事件</item>
    <item>当前时间为北京时间 ${TimeUtils.getBeijingTimeString()}</item>
    <item>如果发现完全相同的消息，比如时间、内容都完全相同，请不要重复创建事件</item>
  </rules>

  <instructions>
    <step>分析群聊记录，识别以下类别：</step>
    <categories>
      <category name="todo">需要完成的任务、作业、工作，若有请给出截止时间</category>
      <category name="notification">重要信息、公告、提醒，若有请给出截止时间</category>
      <category name="entertainment">可选的活动，如音乐会、讲座、展览、活动等</category>
    </categories>
  </instructions>

  <output_format>
    <json_example>
      <![CDATA[
{
  "events": [
    {
      "type": "todo|notification|entertainment",
      "title": "简短标题",
      "description": "详细描述（建议为消息原文部分）",
      "priority": "low|medium|high",
      "due_date": "YYYY-MM-DD HH:mm:ss"
    }
  ]
}
      ]]>
    </json_example>
    <empty_result>
      <![CDATA[
{
  "events": []
}
      ]]>
    </empty_result>
  </output_format>

  <example>
    <input>
      【南京大学庆祝第 41 个教师节大会通知】  
      @所有人  各位主席好！  
      接到通知，学校将在9月10日（周三，明天）上午召开庆祝第 41 个教师节大会...  
    </input>
    <output>
      <![CDATA[
{
  "events": [
    {
      "type": "notification",
      "title": "南京大学庆祝第 41 个教师节大会通知",
      "description": "学校将在9月10日（周三）上午召开庆祝第 41 个教师节大会，烦请各学院派【3名】学生会骨干代表参会...",
      "priority": "medium",
      "due_date": "2024-09-10 17:00:00"
    }
  ]
}
      ]]>
    </output>
  </example>
</task>
`;
const userPrompt = `
<input>
  群聊记录：
  ${context}
</input>
`;

const requestData = {
            model: this.config.model,
            messages: [
                {
                    role: 'system',
                    content: systemPrompt
                },
                {
                    role: 'user',
                    content: userPrompt
                }
            ],
            temperature: 0.3,
            max_tokens: 2000
        };

        const startTime = Date.now();
        
        try {
            const response = await axios.post(`${this.config.apiBase}/chat/completions`, requestData, {
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });

            const duration = Date.now() - startTime;
            
            // 记录AI请求日志
            this.loggingService.logAiRequest(requestData, response.data, duration, analysisContext);

            return response.data.choices[0].message.content;
        } catch (error) {
            const duration = Date.now() - startTime;
            
            // 记录AI请求错误日志
            this.loggingService.logAiRequest(requestData, { error: error.message }, duration, analysisContext);
            this.loggingService.logError(error, {
                context: 'AI分析请求失败',
                analysisContext
            });
            
            throw error;
        }
    }

    /**
     * 解析LLM分析结果
     */
    parseAnalysisResult(analysisText, groupId, sourceMessages) {
        try {
            // 提取JSON部分
            const jsonMatch = analysisText.match(/```json\s*([\s\S]*?)\s*```/);
            let jsonText = jsonMatch ? jsonMatch[1] : analysisText;
            
            // 尝试解析JSON
            const result = JSON.parse(jsonText);
            
            if (!result.events || !Array.isArray(result.events)) {
                console.warn('LLM返回结果格式不正确');
                return [];
            }

            const events = [];
            const sourceMessageIds = sourceMessages.map(m => m.id);

            result.events.forEach(event => {
                // 验证事件类型
                if (!Object.keys(this.supportedEventTypes).includes(event.type)) {
                    console.warn(`不支持的事件类型: ${event.type}`);
                    return;
                }

                // 验证必需字段
                if (!event.title || !event.description) {
                    console.warn('事件缺少必需字段');
                    return;
                }

                // 获取群聊名称（从源消息中获取）
                const groupName = sourceMessages.length > 0 ? sourceMessages[0].group_name : null;
                
                // 构建事件对象
                const eventObj = {
                    event_type: event.type,
                    title: event.title.substring(0, 200), // 限制长度
                    description: event.description.substring(0, 500),
                    content: event.description,
                    source_messages: sourceMessageIds,
                    group_id: parseInt(groupId),
                    group_name: groupName,
                    priority: ['low', 'medium', 'high'].includes(event.priority) ? event.priority : 'medium',
                    due_date: this.parseDueDate(event.due_date)
                };

                events.push(eventObj);
            });

            return events;
        } catch (error) {
            console.error('解析LLM结果失败:', error);
            console.error('原始结果:', analysisText);
            return [];
        }
    }

    /**
     * 解析截止时间
     */
    parseDueDate(dueDateStr) {
        if (!dueDateStr) return null;
        
        try {
            const date = new Date(dueDateStr);
            if (isNaN(date.getTime())) return null;
            return date.toISOString();
        } catch (error) {
            return null;
        }
    }

    /**
     * 获取分析统计信息
     */
    async getAnalysisStats() {
        try {
            const stats = await this.database.getStats();
            return {
                last_analysis_time: stats.last_analysis_time || null,
                total_events_found: parseInt(stats.total_events_found || 0),
                analysis_enabled: !!this.config.apiKey
            };
        } catch (error) {
            console.error('获取分析统计失败:', error);
            return {
                analysis_enabled: !!this.config.apiKey,
                error: error.message
            };
        }
    }
}

module.exports = AIAnalysisService;
