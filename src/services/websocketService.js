const WebSocket = require('ws');
const crypto = require('crypto');

/**
 * WebSocket服务
 * 处理与NapCat的WebSocket反向连接
 */
class WebSocketService {
    constructor(config, database, messageFilter, messageController) {
        this.config = config;
        this.database = database;
        this.messageFilter = messageFilter;
        this.messageController = messageController;
        
        this.wss = null;
        this.clients = new Map(); // 存储连接的客户端
        this.connectionStatus = {
            connected: false,
            clientCount: 0,
            lastHeartbeat: null,
            lastMessage: null
        };

        this.setupWebSocketServer();
    }

    /**
     * 判断消息是否为API响应
     * API响应格式: {"status": "ok/failed", "retcode": number, "data": any, "echo": string}
     */
    isApiResponse(message) {
        return message && 
               typeof message.status === 'string' && 
               typeof message.retcode === 'number' &&
               message.hasOwnProperty('data');
    }

    setupWebSocketServer() {
        const wsPort = parseInt(this.config.PORT) || 8081;
        
        this.wss = new WebSocket.Server({
            port: wsPort,
            host: this.config.HOST || '0.0.0.0',
            perMessageDeflate: false,
            maxPayload: 100 * 1024 * 1024 // 100MB
        });

        console.log(`🔌 WebSocket服务器启动在 ${this.config.HOST}:${wsPort}`);
        console.log(`📋 NapCat连接地址: ws://${this.config.HOST}:${wsPort}`);
        console.log(`🐳 Docker连接地址: ws://host.docker.internal:${wsPort}`);

        this.wss.on('connection', (ws, req) => {
            this.handleConnection(ws, req);
        });

        this.wss.on('error', (error) => {
            console.error('WebSocket服务器错误:', error);
        });

        this.wss.on('listening', () => {
            console.log(`✅ WebSocket服务器监听成功，等待NapCat连接...`);
        });
    }

    handleConnection(ws, req) {
        const clientId = this.generateClientId();
        const clientIP = req.socket.remoteAddress;
        
        console.log(`🔗 新的WebSocket连接: ${clientId} from ${clientIP}`);

        // 验证连接（如果配置了secret）
        if (this.config.WEBSOCKET_SECRET) {
            const authHeader = req.headers.authorization;
            if (!this.verifyAuth(authHeader)) {
                console.log(`❌ WebSocket连接认证失败: ${clientId}`);
                ws.close(1008, 'Authentication failed');
                return;
            }
        }

        // 存储客户端信息
        this.clients.set(clientId, {
            ws,
            clientIP,
            connectedAt: new Date(),
            lastHeartbeat: new Date(),
            isNapCat: false
        });

        // 更新连接状态
        this.updateConnectionStatus();

        // 设置消息处理
        ws.on('message', (data) => {
            this.handleMessage(clientId, data);
        });

        // 设置连接关闭处理
        ws.on('close', (code, reason) => {
            console.log(`🔌 WebSocket连接关闭: ${clientId} (code: ${code}, reason: ${reason})`);
            this.clients.delete(clientId);
            this.updateConnectionStatus();
        });

        // 设置错误处理
        ws.on('error', (error) => {
            console.error(`WebSocket客户端错误 ${clientId}:`, error);
        });

        // 发送欢迎消息
        this.sendToClient(clientId, {
            type: 'system',
            message: 'WebSocket连接成功',
            server: 'Listen2Me',
            timestamp: Date.now()
        });
    }

    async handleMessage(clientId, data) {
        try {
            const client = this.clients.get(clientId);
            if (!client) return;

            // 更新最后活动时间
            client.lastHeartbeat = new Date();
            this.connectionStatus.lastMessage = new Date().toISOString();

            let message;
            try {
                message = JSON.parse(data.toString());
            } catch (err) {
                console.error(`解析消息失败 ${clientId}:`, err);
                return;
            }

            // 详细日志显示收到的消息
            console.log(`📥 收到数据 ${clientId}:`, JSON.stringify(message, null, 2));

            // 区分API响应和事件上报
            if (this.isApiResponse(message)) {
                console.log(`🔄 API响应 ${clientId}:`, message);
                // API响应不需要处理，只记录
                return;
            }

            // 验证基础字段
            if (!message.post_type) {
                console.warn(`❓ 非标准消息 ${clientId}:`, message);
                return;
            }

            // 处理不同类型的消息
            switch (message.post_type) {
                case 'meta_event':
                    await this.handleMetaEvent(clientId, message);
                    break;
                case 'message':
                case 'message_sent':
                    await this.handleMessageEvent(clientId, message);
                    break;
                case 'notice':
                    await this.handleNoticeEvent(clientId, message);
                    break;
                case 'request':
                    await this.handleRequestEvent(clientId, message);
                    break;
                default:
                    console.log(`⚠️ 未知事件类型 ${clientId}: "${message.post_type}"`);
                    console.log(`完整事件数据:`, message);
            }

        } catch (error) {
            console.error(`处理WebSocket消息失败 ${clientId}:`, error);
        }
    }

    async handleMetaEvent(clientId, message) {
        const client = this.clients.get(clientId);
        
        console.log(`🔧 处理元事件 ${clientId}: ${message.meta_event_type} - ${message.sub_type || 'N/A'}`);
        
        if (message.meta_event_type === 'lifecycle') {
            if (message.sub_type === 'connect') {
                console.log(`✅ NapCat连接成功: ${clientId} (self_id: ${message.self_id})`);
                client.isNapCat = true;
                client.selfId = message.self_id;
                this.updateConnectionStatus();
            } else if (message.sub_type === 'enable') {
                console.log(`🟢 OneBot启用: ${clientId} (self_id: ${message.self_id})`);
                client.isNapCat = true;
                client.selfId = message.self_id;
                this.updateConnectionStatus();
            }
        } else if (message.meta_event_type === 'heartbeat') {
            // 心跳消息，更新状态
            console.log(`💓 心跳 ${clientId}: status=${message.status?.online}, interval=${message.interval}`);
            client.lastHeartbeat = new Date();
            this.connectionStatus.lastHeartbeat = new Date().toISOString();
        } else {
            console.log(`❓ 未处理的元事件类型: ${message.meta_event_type}`, message);
        }
    }

    async handleMessageEvent(clientId, message) {
        // 使用消息控制器处理消息
        const result = await this.messageController.handleEvent(message);
        console.log(`消息处理结果 ${clientId}:`, result);
        return result;
    }

    async handleNoticeEvent(clientId, message) {
        console.log(`通知事件 ${clientId}:`, message.notice_type);
        // 可以根据需要处理通知事件
    }

    async handleRequestEvent(clientId, message) {
        console.log(`请求事件 ${clientId}:`, message.request_type);
        // 可以根据需要处理请求事件
    }

    sendToClient(clientId, data) {
        const client = this.clients.get(clientId);
        if (client && client.ws.readyState === WebSocket.OPEN) {
            try {
                client.ws.send(JSON.stringify(data));
                return true;
            } catch (error) {
                console.error(`发送消息到客户端失败 ${clientId}:`, error);
                return false;
            }
        }
        return false;
    }

    broadcastToClients(data) {
        let sentCount = 0;
        this.clients.forEach((client, clientId) => {
            if (this.sendToClient(clientId, data)) {
                sentCount++;
            }
        });
        return sentCount;
    }

    generateClientId() {
        return 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    verifyAuth(authHeader) {
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return false;
        }
        
        const token = authHeader.substring(7);
        return token === this.config.WEBSOCKET_SECRET;
    }

    updateConnectionStatus() {
        const napCatClients = Array.from(this.clients.values()).filter(client => client.isNapCat);
        
        this.connectionStatus = {
            connected: napCatClients.length > 0,
            clientCount: this.clients.size,
            napCatCount: napCatClients.length,
            lastHeartbeat: this.connectionStatus.lastHeartbeat,
            lastMessage: this.connectionStatus.lastMessage,
            clients: Array.from(this.clients.entries()).map(([id, client]) => ({
                id,
                ip: client.clientIP,
                connectedAt: client.connectedAt.toISOString(),
                isNapCat: client.isNapCat,
                selfId: client.selfId || null
            }))
        };
    }

    getConnectionStatus() {
        return {
            ...this.connectionStatus,
            server: {
                port: this.wss?.options?.port,
                clientsConnected: this.clients.size,
                serverUptime: process.uptime()
            }
        };
    }

    getStats() {
        return {
            websocket_enabled: true,
            websocket_port: this.wss?.options?.port,
            connected_clients: this.clients.size,
            napcat_connected: this.connectionStatus.connected,
            last_heartbeat: this.connectionStatus.lastHeartbeat,
            last_message: this.connectionStatus.lastMessage
        };
    }

    close() {
        if (this.wss) {
            console.log('关闭WebSocket服务器...');
            this.wss.close();
            this.clients.clear();
        }
    }
}

module.exports = WebSocketService;
