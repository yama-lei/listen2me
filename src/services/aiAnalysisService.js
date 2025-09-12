const axios = require('axios');
const crypto = require('crypto');

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
    constructor(config, database) {
        this.config = {
            apiBase: config.OPENAI_API_BASE || 'https://api.openai.com/v1',
            apiKey: config.OPENAI_API_KEY,
            model: config.OPENAI_MODEL || 'gpt-3.5-turbo',
            maxMessagesPerAnalysis: parseInt(config.AI_MAX_MESSAGES_PER_ANALYSIS) || 50,
            contextWindowHours: parseInt(config.AI_CONTEXT_WINDOW_HOURS) || 2
        };
        
        this.database = database;
        
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

            for (const [groupId, groupMessages] of Object.entries(messagesByGroup)) {
                console.log(`分析群聊 ${groupId} 的 ${groupMessages.length} 条消息`);
                
                const events = await this.analyzeGroupMessages(groupId, groupMessages);
                allEvents.push(...events);
            }

            // 保存分析结果
            for (const event of allEvents) {
                await this.database.insertAnalyzedEvent(event);
            }

            // 标记消息为已处理
            const messageIds = messages.map(m => m.id);
            await this.database.markMessagesProcessed(messageIds);

            // 更新分析任务状态
            await this.database.recordAnalysisTask(taskId, 'completed', messages.length, allEvents.length);
            
            // 更新统计信息
            await this.database.updateStat('last_analysis_time', new Date().toISOString());
            await this.database.updateStat('total_events_found', allEvents.length);

            console.log(`AI分析完成: 处理 ${messages.length} 条消息，识别 ${allEvents.length} 个事件`);
            
            return {
                taskId,
                processed: messages.length,
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
     * 分析特定群聊的消息
     */
    async analyzeGroupMessages(groupId, messages) {
        if (!this.config.apiKey) {
            console.warn('未配置API密钥，跳过AI分析');
            return [];
        }

        try {
            // 构建上下文
            const context = this.buildAnalysisContext(messages);
            
            // 调用LLM分析
            const analysis = await this.callLLM(context);
            
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
    buildAnalysisContext(messages) {
        const sortedMessages = messages.sort((a, b) => a.timestamp - b.timestamp);
        
        let context = '以下是最近的群聊消息记录：\n\n';
        
        sortedMessages.forEach((message, index) => {
            const time = new Date(message.timestamp * 1000).toLocaleString('zh-CN');
            const nickname = message.sender_nickname || `用户${message.user_id}`;
            context += `[${time}] ${nickname}: ${message.message_content}\n`;
        });
        
        return context;
    }

    /**
     * 调用LLM进行分析
     */
    async callLLM(context) {
        const prompt = `你是一个智能助手，专门分析群聊消息并识别其中的待办事项、通知和文娱活动。

请分析以下群聊记录，识别出其中可能包含的：
1. 待办事项 (todo) - 需要完成的任务、作业、工作等
2. 通知 (notification) - 重要信息、公告、提醒等
3. 文娱活动 (entertainment) - 聚会、游戏、娱乐活动等

对于每个识别出的项目，请提供：
- 类型 (todo/notification/entertainment)
- 标题 (简短描述)
- 详细描述
- 置信度 (0-1之间的数值)
- 优先级 (low/medium/high)
- 截止时间 (如果有的话，格式：YYYY-MM-DD HH:mm:ss)

请以JSON格式返回结果，格式如下：
\`\`\`json
{
  "events": [
    {
      "type": "todo|notification|entertainment",
      "title": "简短标题",
      "description": "详细描述",
      "confidence": 0.8,
      "priority": "medium",
      "due_date": "2024-01-01 10:00:00"
    }
  ]
}
\`\`\`

如果没有识别出任何事件，返回空数组。

群聊记录：
${context}`;

        const response = await axios.post(`${this.config.apiBase}/chat/completions`, {
            model: this.config.model,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.3,
            max_tokens: 2000
        }, {
            headers: {
                'Authorization': `Bearer ${this.config.apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        return response.data.choices[0].message.content;
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

                // 构建事件对象
                const eventObj = {
                    event_type: event.type,
                    title: event.title.substring(0, 200), // 限制长度
                    description: event.description.substring(0, 500),
                    content: event.description,
                    source_messages: sourceMessageIds,
                    group_id: parseInt(groupId),
                    confidence: Math.max(0, Math.min(1, event.confidence || 0.5)),
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
