import { crypto } from 'https://deno.land/std@0.182.0/crypto/mod.ts'
import { parse } from "https://deno.land/std@0.182.0/flags/mod.ts";
import { serve } from "https://deno.land/std@0.182.0/http/server.ts";

// 默认端口号
const DEFAULT_PORT = 8080;

// 当贝 API 地址
const API_DOMAIN = 'https://ai-api.dangbei.net';

// 最大会话轮数
const MAX_CONVERSATION_COUNT = 50;

// 用户代理列表
const USER_AGENTS = [
    // PC端浏览器: https://github.com/microlinkhq/top-user-agents/blob/master/src/desktop.json
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:135.0) Gecko/20100101 Firefox/135.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) obsidian/1.6.5 Chrome/124.0.6367.243 Electron/30.1.2 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 OPR/116.0.0.0",
    "Mozilla/5.0 (X11; Linux x86_64; rv:135.0) Gecko/20100101 Firefox/135.0",
    "Deno/1.45.2 (variant; SupabaseEdgeRuntime/1.67.2)",
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:135.0) Gecko/20100101 Firefox/135.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.114 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) obsidian/1.8.3 Chrome/130.0.6723.191 Electron/33.3.2 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1.1 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) obsidian/1.6.5 Chrome/124.0.6367.243 Electron/30.1.2 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) obsidian/1.8.4 Chrome/130.0.6723.191 Electron/33.3.2 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.137 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 Edg/132.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; rv:135.0) Gecko/20100101 Firefox/135.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64; rv:134.0) Gecko/20100101 Firefox/134.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) obsidian/1.7.7 Chrome/128.0.6613.186 Electron/32.2.5 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) obsidian/1.7.7 Chrome/128.0.6613.186 Electron/32.2.5 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.5938.132 Safari/537.36",
    "Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) obsidian/1.6.7 Chrome/124.0.6367.243 Electron/30.1.2 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:134.0) Gecko/20100101 Firefox/134.0",
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:134.0) Gecko/20100101 Firefox/134.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 Edg/132.0.0.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) obsidian/1.8.4 Chrome/130.0.6723.191 Electron/33.3.2 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.86",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 OPR/114.0.0.0",
    "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 OPR/117.0.0.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 OPR/115.0.0.0",

    // 移动端浏览器: https://github.com/microlinkhq/top-user-agents/blob/master/src/mobile.json
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1.1 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/133.0.6943.120 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"
]

// 鉴权密钥
const VALID_API_KEY = 'sk-your-api-key';

// 支持的模型列表
const SUPPORTED_MODELS = [
    'deepseek-v3',
    'deepseek-v3-search',
    'deepseek-r1',
    'deepseek-r1-search',
    'doubao',
    'doubao-search',
    'qwen',
    'qwen-search'
]

class ChatManage {
    constructor() {
        this.currentDeviceId = null;
        this.currentConversationId = null;
        this.userAgent = null;
    }

    getOrCreateIds(forceNew = false) {
        // 如果强制新建，创建新的设备ID
        if (forceNew || !this.currentDeviceId || this.conversationCount >= MAX_CONVERSATION_COUNT) {
            this.currentDeviceId = this.generateDeviceId();
            this.currentConversationId = null;
            this.conversationCount = 0;

            // 随机选择一个 userAgent
            this.userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

            console.log(`New deviceId ${this.currentDeviceId} has been created`);
        } else {
            this.conversationCount++;
        }

        return {
            deviceId: this.currentDeviceId,
            conversationId: this.currentConversationId,
            userAgent: this.userAgent
        };
    }

    generateDeviceId() {
        const uuid = crypto.randomUUID();
        const urlAlphabet = 'useandom26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';
        const nanoid = Array.from(crypto.getRandomValues(new Uint8Array(20)))
            .map(b => urlAlphabet[b % urlAlphabet.length])
            .join('');
        return `${uuid.replace(/-/g, '')}_${nanoid}`;
    }
}

class Pipe {
    constructor() {
        this.dataPrefix = 'data:';
        this.chatManage = new ChatManage();
    }

    // 创建新的会话
    async _createConversation(deviceId, userAgent) {
        const payload = { botCode: "AI_SEARCH" };
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const nonce = this.nanoid(21);
        const sign = await this.generateSign(timestamp, payload, nonce);

        const headers = {
            "Origin": "https://ai.dangbei.com",
            "Referer": "https://ai.dangbei.com/",
            "User-Agent": userAgent,
            "deviceId": deviceId,
            "nonce": nonce,
            "sign": sign,
            "timestamp": timestamp,
            "Content-Type": "application/json"
        };

        console.log(`Creating conversation with deviceId: ${deviceId}`);

        try {
            const response = await fetch(`${API_DOMAIN}/ai-search/conversationApi/v1/create`, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    return data.data.conversationId;
                }
            }
        } catch (e) {
            console.error('Error creating conversation:', e);
        }
        return null;
    }

    // 新增方法：构建完整提示
    _buildFullPrompt(messages) {
        if (!messages || messages.length === 0) {
            return '';
        }
        let systemPrompt = '';
        const history = [];
        let lastUserMessage = '';

        // 解析消息结构
        for (const msg of messages) {
            if (msg.role === 'system' && !systemPrompt) {
                systemPrompt = msg.content;
            } else if (msg.role === 'user') {
                history.push(`user: ${msg.content}`);
                lastUserMessage = msg.content;
            } else if (msg.role === 'assistant') {
                history.push(`assistant: ${msg.content}`);
            }
        }

        // 构建最终提示
        const parts = [];
        if (systemPrompt) {
            parts.push(`[System Prompt]\n${systemPrompt}`);
        }
        if (history.length > 1) {
            parts.push(`[Chat History]\n${history.slice(0, -1).join('\n')}`);
        }
        parts.push(`[Question]\n${lastUserMessage}`);

        return parts.join('\n\n');
    }

    async* pipe(body) {
        const model = (body.model || 'deepseek-r1').trim();
        if (!SUPPORTED_MODELS.includes(model)) {
            yield { error: `Unsupported model: ${model}` };
            return;
        }

        // 强制创建新会话（修改部分）
        const { deviceId, userAgent } = this.chatManage.getOrCreateIds(false);
        let conversationId = await this._createConversation(deviceId, userAgent);

        if (!conversationId) {
            console.error('Failed to create conversation');
            yield { error: 'Failed to create conversation' };
            return;
        }

        const thinkingState = { thinking: -1 };

        // 动态设置 userAction
        const actions = [];
        if (model.startsWith('deepseek-r1')) {
            actions.push('deep');
        }

        if (model.endsWith('-search')) {
            actions.push('online');
        }
        const userAction = actions.join(',');

        // 最终的请求模型
        const requestModel = model.split('-')[0];

        console.log(`Communication with model: ${requestModel}, userAction: ${userAction}, deviceId: ${deviceId}, conversationId: ${conversationId}`);

        // 移除清除上下文的处理逻辑（因为每次都是新会话）
        const fullPrompt = this._buildFullPrompt(body.messages);
        const payload = {
            stream: true,
            botCode: 'AI_SEARCH',
            userAction: userAction,  // 使用动态的 userAction
            model: requestModel,
            conversationId: conversationId,
            question: fullPrompt,  // 使用完整提示
        };

        const timestamp = Math.floor(Date.now() / 1000).toString();
        const nonce = this.nanoid(21);
        const sign = await this.generateSign(timestamp, payload, nonce);

        const headers = {
            'Origin': 'https://ai.dangbei.com',
            'Referer': 'https://ai.dangbei.com/',
            'User-Agent': userAgent,
            'deviceId': deviceId,
            'nonce': nonce,
            'sign': sign,
            'timestamp': timestamp,
            'Content-Type': 'application/json',
        };

        try {
            const response = await fetch(`${API_DOMAIN}/ai-search/chatApi/v1/chat`, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const error = await response.text();
                console.error('HTTP Error:', response.status, error);
                yield { error: `HTTP ${response.status}: ${error}` };
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let cardMessages = [];

            // 搜索信息是否已经存在
            let isDuplicated = false;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith(this.dataPrefix)) continue;

                    try {
                        const data = JSON.parse(line.slice(this.dataPrefix.length));
                        if (data.type === 'answer') {
                            const content = data.content;
                            const contentType = data.content_type;

                            if (thinkingState.thinking === -1 && contentType === 'thinking') {
                                thinkingState.thinking = 0;
                                yield { choices: [{ delta: { content: '<think>\n\n' }, finish_reason: null }] };
                            } else if (thinkingState.thinking === 0 && contentType === 'text') {
                                thinkingState.thinking = 1;
                                yield { choices: [{ delta: { content: '\n' }, finish_reason: null }] };
                                yield { choices: [{ delta: { content: '</think>' }, finish_reason: null }] };
                                yield { choices: [{ delta: { content: '\n\n' }, finish_reason: null }] };
                            }

                            if (contentType === 'card') {
                                // 格式化 cardMessages 内容为 Markdown
                                const cardContent = JSON.parse(content);
                                const cardItems = cardContent.cardInfo.cardItems;
                                let markdownOutput = '\n\n---\n\n';

                                // 是否包含有效的搜索信息
                                let foundSearchResult = false;

                                // 处理搜索关键词（type: 2001）
                                const searchKeywords = cardItems.find(item => item.type === '2001');
                                if (searchKeywords) {
                                    // 处理搜索关键词，移除关键词中无用的单词，若移除后为空，则不显示该搜索关键字
                                    const pattern = /(\[(Question|System Prompt|Chat History)\]\n|(user|assistant):)/;
                                    const keywords = JSON.parse(searchKeywords.content).map(word => word.replace(pattern, '')).filter(word => word.trim() !== '');

                                    if (keywords.length !== 0) {
                                        markdownOutput += `搜索关键字：${keywords.join('; ')}。`;
                                    }
                                }

                                // 处理搜索结果（type: 2002）
                                const searchResults = cardItems.find(item => item.type === '2002');
                                if (searchResults) {
                                    const results = JSON.parse(searchResults.content);
                                    foundSearchResult = true;
                                    markdownOutput += `共找到 ${results.length} 个搜索结果：\n`;

                                    results.forEach((result) => {
                                        let text = `[${result.idIndex}] [${result.name}](${result.url})`
                                        if (result.siteName) {
                                            text += `  来源：${result.siteName}`;
                                        }

                                        text += '\n';
                                        markdownOutput += text;
                                    });
                                }

                                if (!isDuplicated && foundSearchResult) {
                                    cardMessages.push(markdownOutput);
                                    isDuplicated = true;
                                } else if (foundSearchResult) {
                                    console.log(`重复的搜索信息已被丢弃：\n${markdownOutput}`);
                                }
                            }

                            if (content && (contentType === 'text' || contentType === 'thinking')) {
                                yield { choices: [{ delta: { content }, finish_reason: null }] };
                            }
                        }
                    } catch (e) {
                        console.error('Parse error:', e, 'Line:', line);
                        yield { error: `JSONDecodeError: ${e.message}` };
                        return;
                    }
                }
            }

            if (cardMessages.length > 0) {
                yield { choices: [{ delta: { content: cardMessages.join('') }, finish_reason: null }] };
            }

            yield {
                choices: [{
                    delta: {
                        meta: {
                            device_id: deviceId,
                            conversation_id: conversationId
                        }
                    },
                    finish_reason: null
                }]
            };

        } catch (e) {
            console.error('Error in pipe:', e);
            yield { error: `${e.name}: ${e.message}` };
            return;
        }
    }

    nanoid(size = 21) {
        const urlAlphabet = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';
        const bytes = new Uint8Array(size);
        crypto.getRandomValues(bytes);
        return Array.from(bytes).reverse().map(b => urlAlphabet[b & 63]).join('');
    }

    async generateSign(timestamp, payload, nonce) {
        const payloadStr = JSON.stringify(payload);
        const signStr = `${timestamp}${payloadStr}${nonce}`;
        const msgBuffer = new TextEncoder().encode(signStr);
        const hashBuffer = await crypto.subtle.digest('MD5', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    }
}

const pipe = new Pipe();

// 验证 API 密钥
function verifyApiKey(request) {
    const authorization = request.headers.get('Authorization');
    if (!authorization) {
        return new Response(JSON.stringify({ error: 'Missing API key' }), {
            status: 401,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });
    }

    const apiKey = authorization.replace('Bearer ', '').trim();
    if (apiKey !== VALID_API_KEY) {
        return new Response(JSON.stringify({ error: 'Invalid API key' }), {
            status: 401,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });
    }

    return null;
}

async function handleRequest(request) {
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            },
        });
    }

    const url = new URL(request.url);

    // 验证 API 密钥（除了 OPTIONS 请求）
    const authError = verifyApiKey(request);
    if (authError) return authError;

    if (request.method === 'GET' && url.pathname === '/v1/models') {
        const timestamp = Math.floor(Date.now() / 1000);
        return new Response(JSON.stringify({
            object: 'list',
            data: SUPPORTED_MODELS.map(model => ({
                id: model,
                object: 'model',
                created: timestamp,
                owned_by: 'deepseek'
            }))
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });
    }

    if (request.method === 'POST' && url.pathname === '/v1/chat/completions') {
        const body = await request.json();
        const isStream = body.stream || false;

        if (isStream) {
            const stream = new ReadableStream({
                async start(controller) {
                    try {
                        for await (const chunk of pipe.pipe(body)) {
                            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
                        }
                        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
                        controller.close();
                    } catch (e) {
                        controller.error(e);
                    }
                },
            });

            return new Response(stream, {
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        }

        let content = '';
        let meta = null;
        try {
            for await (const chunk of pipe.pipe(body)) {
                if (chunk.choices?.[0]?.delta?.content) {
                    content += chunk.choices[0].delta.content;
                }
                if (chunk.choices?.[0]?.delta?.meta) {
                    meta = chunk.choices[0].delta.meta;
                }
            }

            const parts = content.split('\n\n\n', 2);
            const reasoningContent = parts[0] || '';
            const finalContent = parts[1] || '';

            return new Response(JSON.stringify({
                id: crypto.randomUUID(),
                object: 'chat.completion',
                created: Math.floor(Date.now() / 1000),
                model: body.model,
                choices: [{
                    message: {
                        role: 'assistant',
                        reasoning_content: reasoningContent,
                        content: finalContent,
                        meta: meta
                    },
                    finish_reason: 'stop'
                }]
            }), {
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        } catch (e) {
            console.error('Error processing chat request:', e);
            return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        }
    }

    return new Response('Not Found', { status: 404 });
}

async function startServer(port: number) {
    console.log(`Starting proxy server on port ${port}`);
    await serve(handleRequest, {
        port,
        onListen: () => {
            console.log(`Listening on http://localhost:${port}`);
        },
    });
}

if (import.meta.main) {
    const { args } = Deno;
    const parsedArgs = parse(args);
    const port = parsedArgs.port ? Number(parsedArgs.port) : DEFAULT_PORT;
    startServer(port);
}
