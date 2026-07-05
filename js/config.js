/**
 * 配置模块
 * 包含 API 配置、系统提示词等核心配置
 */

export const CONFIG = {
  /** 应用版本号（十进制递增，如 1.1.6 → 1.1.7 → 1.1.8）
   *  每次修改都需同步更新此版本号及所有 ?v=xx 引用和 sw.js 缓存版本 */
  APP_VERSION: "1.2.8",

  /** 应用名称 */
  APP_NAME: "灵知",

  /** 应用简介 */
  APP_DESCRIPTION: "基于大语言模型的智能对话助手，支持数学公式渲染、语音播报、多会话管理等功能。",

  /** 开发者 */
  APP_DEVELOPER: "Stone",

  /** 聊天 API 代理地址（Cloudflare Worker） */
  API_URL: "https://api.chatlz.dpdns.org/v1/chat/completions",

  /** 用户认证与数据同步 API 地址（Cloudflare Worker D1） */
  API_BASE_URL: "https://chat-app-db.chatlz.dpdns.org",

  /**
   * TTS 代理地址（Cloudflare Worker）。
   * 留空则仅使用浏览器本地 Web Speech API（微信内不可用时会引导外部打开）。
   */
  TTS_WORKER_URL: "https://tts.chatlz.dpdns.org/api/tts",

  /** 存储键名 */
  STORAGE_KEY: "ai_chat_sessions",
  THEME_STORAGE_KEY: "lingzhi_theme",
  TOKEN_KEY: "lingzhi_token",
  USER_KEY: "lingzhi_user",
  GUEST_MSG_KEY: "lingzhi_guest_msg_count",

  /** 模型配置（API 调用使用） */
  MODEL: "agnes-2.0-flash",
  /** 模型显示名称（关于弹窗展示） */
  MODEL_DISPLAY: "Powered by Sapiens AI",
  MAX_TOKENS: 2048,
  TEMPERATURE: 0.3,

  /** 重试配置 */
  MAX_RETRIES: 2,
  RETRY_BASE_DELAY: 1000,

  /** UI 配置 */
  MAX_TEXTAREA_HEIGHT: 120,
  KATEX_WAIT_TIMEOUT: 5000,

  /** TTS 高亮同步配置
   *  TTS_HIGHLIGHT_DELAY: 高亮时间偏移（秒）。
   *    - 正值：高亮滞后于声音（声音先到，高亮后到）
   *    - 负值：高亮超前于声音（高亮先到，声音后到）
   *    - 默认 0，根据实际体验调整
   */
  TTS_HIGHLIGHT_DELAY: 0,
  TTS_DEBUG: false,
};

/** 系统提示词 */
export const SYSTEM_PROMPT =
  "你是一个智能、友好、知识渊博的 AI 助手。请用中文回答用户的问题，回答要清晰、准确、有条理。\n\n" +
  "【输出格式要求】\n" +
  "1. 数学公式使用 LaTeX 语法并用美元符号包裹：\n" +
  "   - 行内公式：用 $...$ 包裹，例如 $\\sqrt{4}$、$\\frac{1}{2}$、$x^2$、$a^2+b^2=c^2$\n" +
  "   - 独占一行的大公式：用 $$...$$ 包裹，例如 $$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$\n" +
  "2. 根号写法：$\\sqrt{4}$ 而不是 √4\n" +
  "3. 分数写法：$\\frac{1}{2}$ 而不是 1/2\n" +
  "4. 平方写法：$x^2$ 而不是 x²\n" +
  "5. 使用 Markdown 格式组织内容（# 标题，**加粗**，- 列表等）\n" +
  "6. 严格禁止任何自我介绍，直接给出答案\n" +
  "7. 回答结束后，**必须**用一行 `---相关问题---` 作为分隔，然后列出 2~3 个用户可能继续问的问题，每行以 `?` 开头，例如：\n" +
  "   ? 第一个相关问题？\n" +
  "   ? 第二个相关问题？\n" +
  "   （此段必须出现在回答的最后，绝不能省略）";

/** 统一身份回复文案 */
export const IDENTITY_REPLY = "你好！我是灵知，由Stone开发，大模型调用Sapiens。";

/** 身份关键词列表（用于识别身份类问题） */
export const IDENTITY_KW = [
  "你是谁", "您是谁", "你是谁呀", "你是谁啊",
  "你叫什么名字", "你叫啥",
  "你的名字", "您的名字",
  "你是哪位", "你是哪个", "你是什么东西",
  "介绍一下你自己", "介绍一下自己", "介绍你自己", "自我介绍",
  "你是由谁开发的", "由谁开发", "是谁开发的", "谁开发的你", "谁开发了你",
  "你的开发者", "谁做的你", "谁制作的你", "你的作者",
  "who are you", "what is your name", "your name",
  "who made you", "who created you", "who developed you",
];
