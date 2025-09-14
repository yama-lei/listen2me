const { CronJob } = require('cron');

/**
 * 调度服务
 * 负责管理定时任务
 */
class SchedulerService {
    constructor(aiAnalysisService, config, database) {
        this.aiAnalysisService = aiAnalysisService;
        this.config = config;
        this.database = database;
        this.jobs = [];
        
        // 从配置获取分析间隔（分钟）
        this.analysisInterval = parseInt(config.AI_ANALYSIS_INTERVAL_MINUTES) || 30;
        
        try {
            this.setupJobs();
        } catch (error) {
            console.error('设置定时任务失败:', error);
        }
    }

    setupJobs() {
        // AI分析定时任务
        // 创建cron表达式：每N分钟执行一次
        const cronExpression = `*/${this.analysisInterval} * * * *`;
        
        const analysisJob = new CronJob(
            cronExpression,
            () => this.runAnalysisTask(),
            null, // onComplete callback
            false, // start immediately
            'Asia/Shanghai' // timezone
        );

        this.jobs.push({
            name: 'ai_analysis',
            job: analysisJob,
            description: `AI消息分析 (每${this.analysisInterval}分钟)`
        });

        // 过期事件检查任务 - 每小时执行一次
        const expirationJob = new CronJob(
            '0 * * * *', // 每小时的第0分钟执行
            () => this.runExpirationCheck(),
            null,
            false,
            'Asia/Shanghai'
        );

        this.jobs.push({
            name: 'expiration_check',
            job: expirationJob,
            description: '过期事件检查 (每小时)'
        });

        console.log(`定时任务设置完成: AI分析将每${this.analysisInterval}分钟执行一次，过期检查每小时执行一次`);
    }

    /**
     * 启动所有定时任务
     */
    start() {
        this.jobs.forEach(({ name, job, description }) => {
            try {
                job.start();
                console.log(`定时任务 [${name}] 启动成功: ${description}`);
            } catch (error) {
                console.error(`定时任务 [${name}] 启动失败:`, error);
            }
        });
    }

    /**
     * 停止所有定时任务
     */
    stop() {
        this.jobs.forEach(({ name, job }) => {
            try {
                job.stop();
                console.log(`定时任务 [${name}] 已停止`);
            } catch (error) {
                console.error(`定时任务 [${name}] 停止失败:`, error);
            }
        });
    }

    /**
     * 执行AI分析任务
     */
    async runAnalysisTask() {
        const startTime = Date.now();
        console.log(`[${new Date().toLocaleString()}] 开始执行AI分析任务`);
        
        try {
            const result = await this.aiAnalysisService.analyzeMessages();
            const duration = Date.now() - startTime;
            
            console.log(`AI分析任务完成:`);
            console.log(`- 处理消息: ${result.processed} 条`);
            console.log(`- 识别事件: ${result.events.length} 个`);
            console.log(`- 耗时: ${duration}ms`);
            
            if (result.events.length > 0) {
                console.log('识别的事件:');
                result.events.forEach((event, index) => {
                    console.log(`  ${index + 1}. [${event.event_type}] ${event.title} (置信度: ${event.confidence})`);
                });
            }
            
        } catch (error) {
            const duration = Date.now() - startTime;
            console.error(`AI分析任务失败 (耗时: ${duration}ms):`, error.message);
        }
    }

    /**
     * 执行过期事件检查任务
     */
    async runExpirationCheck() {
        const startTime = Date.now();
        console.log(`[${new Date().toLocaleString()}] 开始执行过期事件检查任务`);
        
        try {
            const expiredCount = await this.database.markExpiredEvents();
            const duration = Date.now() - startTime;
            
            if (expiredCount > 0) {
                console.log(`过期事件检查完成: 标记了 ${expiredCount} 个过期事件 (耗时: ${duration}ms)`);
            } else {
                console.log(`过期事件检查完成: 没有发现过期事件 (耗时: ${duration}ms)`);
            }
            
        } catch (error) {
            const duration = Date.now() - startTime;
            console.error(`过期事件检查失败 (耗时: ${duration}ms):`, error.message);
        }
    }

    /**
     * 手动触发AI分析
     */
    async triggerAnalysis() {
        console.log('手动触发AI分析任务');
        return await this.runAnalysisTask();
    }

    /**
     * 手动触发过期检查
     */
    async triggerExpirationCheck() {
        console.log('手动触发过期事件检查任务');
        return await this.runExpirationCheck();
    }

    /**
     * 获取任务状态
     */
    getStatus() {
        return {
            jobs: this.jobs.map(({ name, job, description }) => ({
                name,
                description,
                running: job.running || false,
                lastDate: job.lastDate && typeof job.lastDate.toISOString === 'function' 
                    ? job.lastDate.toISOString() 
                    : null,
                nextDate: job.nextDate && typeof job.nextDate.toISOString === 'function' 
                    ? job.nextDate.toISOString() 
                    : null
            })),
            analysis_interval_minutes: this.analysisInterval
        };
    }

    /**
     * 更新分析间隔
     */
    updateAnalysisInterval(intervalMinutes) {
        if (intervalMinutes < 1 || intervalMinutes > 1440) { // 1分钟到24小时
            throw new Error('分析间隔必须在1-1440分钟之间');
        }

        this.analysisInterval = intervalMinutes;
        
        // 停止现有的分析任务
        const analysisJob = this.jobs.find(j => j.name === 'ai_analysis');
        if (analysisJob) {
            analysisJob.job.stop();
        }

        // 重新设置定时任务
        const cronExpression = `*/${this.analysisInterval} * * * *`;
        const newJob = new CronJob(
            cronExpression,
            () => this.runAnalysisTask(),
            null,
            true, // 立即启动
            'Asia/Shanghai'
        );

        // 更新任务列表
        const jobIndex = this.jobs.findIndex(j => j.name === 'ai_analysis');
        if (jobIndex >= 0) {
            this.jobs[jobIndex] = {
                name: 'ai_analysis',
                job: newJob,
                description: `AI消息分析 (每${this.analysisInterval}分钟)`
            };
        }

        console.log(`AI分析间隔已更新为${this.analysisInterval}分钟`);
    }
}

module.exports = SchedulerService;
