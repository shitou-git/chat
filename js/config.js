/**
 * 配置模块
 * 包含 API 配置、密钥混淆、系统提示词等核心配置
 */

export const CONFIG = {
  /** API 端点 */
  API_URL: "https://apihub.agnes-ai.com/v1/chat/completions",

  /**
   * TTS 代理地址（Cloudflare Worker，部署后填入）。
   * 留空则仅使用浏览器本地 Web Speech API（微信内不可用时会引导外部打开）。
   */
  TTS_WORKER_URL: "https://tts.chatlz.dpdns.org/api/tts",

  /** 存储键名 */
  STORAGE_KEY: "ai_chat_sessions",
  THEME_STORAGE_KEY: "lingzhi_theme",
  AUTO_PLAY_KEY: "lingzhi_auto_play",

  /** 模型配置 */
  MODEL: "agnes-2.0-flash",
  MAX_TOKENS: 2048,
  TEMPERATURE: 0.3,

  /** 重试配置 */
  MAX_RETRIES: 2,
  RETRY_BASE_DELAY: 1000,

  /** UI 配置 */
  MAX_TEXTAREA_HEIGHT: 120,
  KATEX_WAIT_TIMEOUT: 5000,
};

/* ================================================================
 * 凭证混淆层
 *
 * ⚠️ 纯前端无法真正保护密钥，以下为多层混淆以显著提高
 *    逆向提取成本。如需真正安全请使用后端代理。
 *
 * 混淆策略（4 层）：
 *   1. XOR 加密——原始密钥逐字节与掩码异或，非简单编码
 *   2. 分片存储——密文拆成多段 hex，散落在不同数组位置
 *   3. 变量名伪装——函数/变量名不暗示与密钥的关系
 *   4. 运行时拼装——密钥不落变量，用后即弃
 *
 * 更换密钥：运行 keygen.html，粘贴新 Key 即可生成新代码块
 * ================================================================ */

// 第 1 层：密文分片（XOR 后的 hex）
var _cf = [
  "0b06140723060567", "3d5a5c02006b2335",
  "3b596d5f664a383f", "290e502430420711",
  "31227f3b3a663a37", "0e195d5330574129",
  "4e0363"
];

// 第 2 层：掩码（看起来像构建版本号）
var _bv = "xm9kQ2vP";

// 第 3 层：解码函数
function _pc(h, k) {
  var r = "";
  for (var i = 0; i < h.length; i += 2) {
    r += String.fromCharCode(
      parseInt(h.substr(i, 2), 16) ^ k.charCodeAt((i >> 1) % k.length)
    );
  }
  return r;
}

// 第 4 层：运行时拼装——每次调用重新解密，不缓存到变量
export function _ar() {
  return _pc(_cf.join(""), _bv);
}

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
