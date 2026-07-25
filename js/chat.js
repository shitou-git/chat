
/**
 * 聊天模块
 * 包含消息发送、流式渲染、API 调用等核心逻辑
 */
 
import { CONFIG, SYSTEM_PROMPT, IDENTITY_REPLY, IDENTITY_KW } from './config.js?v=1.3.15';
import {
  state,
  addMessageData,
  chatData,
  currentSession,
  saveChatHistory
} from './state.js?v=1.3.15';
import {
  renderContent,
  renderContentLight,
  sanitizeIdentity,
  delay,
  autoScaleKatex,
  extractFollowUpQuestions,
  generateFallbackQuestions,
  escapeHtml
} from './utils.js?v=1.3.15';
import {
  renderCurrentSession,
  renderEmptyState,
  scrollToBottom,
  attachLongPressToBubble,
  createMessageElement,
  renderFollowUpButtons,
  domRefs as renderRefs
} from './render.js?v=1.3.15';
import {
  stopAllSpeak,
  updateHeaderPlayBtn,
  attachSpeakButton as attachSpeakButtonToBubble
} from './tts.js?v=1.3.15';
import { authToken, isLoggedIn } from './auth.js?v=1.3.15';
 
// ================================================================
// 发送/停止
// ================================================================
 
export function toggleSendButton(generating) {
  state.isGenerating = generating;
  var chatSendBtn = document.getElementById("chatSendBtn");
  if (!chatSendBtn) return;
  if (generating) {
    chatSendBtn.textContent = "⏹";
    chatSendBtn.title = "停止生成";
    chatSendBtn.setAttribute("aria-label", "停止生成");
    chatSendBtn.classList.add("is-stop");
  } else {
    chatSendBtn.textContent = "→";
    chatSendBtn.title = "发送";
    chatSendBtn.setAttribute("aria-label", "发送");
    chatSendBtn.classList.remove("is-stop");
  }
}
 
export function stopGeneration() {
  if (state.abortController) state.abortController.abort();
}

function estimateLineCount(text) {
  if (!text) return 0;
  var m = text.match(/\n/g);
  return (m ? m.length : 0) + 1;
}

// ================================================================
// 自适应打字机配置
//   上游 SSE 通常为"假性 batch"或长输出真流式，直接节流渲染会
//   出现"一片一片"或"一次性"现象。改为生产-消费模型：
//   - producer: reader.read() 持续塞 buffer
//   - consumer: requestAnimationFrame 每帧消费若干字符
//   命中稳定边界（段落 / 公式闭合 / 代码块闭合 / 句末）时
//   把已消费部分提交给 renderContentLight 重新渲染。
// ================================================================
var TYPER = {
  BASE_CHARS_PER_FRAME: 2,    // 基础速度：每帧追加字符数（约 120 字/秒 @60fps）
  MAX_CHARS_PER_FRAME: 8,     // buffer 充足时加速上限（约 480 字/秒）
  MIN_CHARS_PER_FRAME: 1,     // buffer 即将耗尽时减速下限
  BUFFER_HIGH_WATER: 240,     // buffer 长度超过此值 → 加速消费
  BUFFER_LOW_WATER: 12,       // buffer 长度低于此值 → 减速等待
  FRAME_MS: 16,               // 一帧大约 16ms（60fps）
  PLAINTEXT_THRESHOLD: 5000,  // 已消费字符超过此值 → 切换为 plaintext 增量模式
  AUTO_SCROLL_LINE_LIMIT: 12, // 超过此行数不再每帧滚动（避免打断用户上滑阅读）
  SCROLL_THROTTLE_MS: 120,    // plaintext 模式滚动节流
  FLUSH_FINAL_TIMEOUT_MS: 200 // 流结束后等待最后一段渲染的最大延迟
};

/** 在已消费文本末尾寻找最近的"稳定边界"用于 commit。
 *  返回边界后一个字符的索引（即下次 commit 起始位置），找不到返回 0。 */
function findCommitBoundary(text) {
  if (!text) return 0;
  var len = text.length;
  // 从末尾往前找，最多回看 400 字符
  var lookback = Math.min(len, 400);
  var start = len - lookback;

  // 1) 闭合的代码块 ```...```
  var lastFence = text.lastIndexOf("```", len - 1);
  if (lastFence > start) {
    // 确认这是一个完整的闭合标记（前面应该有奇数个 ```）
    var fenceCount = 0;
    var idx = 0;
    while ((idx = text.indexOf("```", idx)) !== -1 && idx <= lastFence) {
      fenceCount++;
      idx += 3;
    }
    if (fenceCount % 2 === 0 && fenceCount > 0) {
      return lastFence + 3;
    }
  }

  // 2) 闭合的块级公式 $$...$$
  var lastBlockMathEnd = text.lastIndexOf("$$", len - 1);
  if (lastBlockMathEnd > start + 2) {
    var mathStart = text.lastIndexOf("$$", lastBlockMathEnd - 2);
    if (mathStart >= 0 && mathStart < lastBlockMathEnd) {
      return lastBlockMathEnd + 2;
    }
  }

  // 3) 段落结束（连续两个换行）
  var doubleNl = text.lastIndexOf("\n\n", len - 1);
  if (doubleNl >= start) {
    return doubleNl + 2;
  }

  // 4) 句末标点（。！？.!?）后接换行或行尾
  for (var i = len - 1; i >= start; i--) {
    var ch = text.charAt(i);
    if (ch === "。" || ch === "！" || ch === "？" || ch === "." || ch === "!" || ch === "?") {
      // 检查后面是否为换行或行尾
      var after = text.charAt(i + 1);
      if (after === "" || after === "\n") {
        return i + 1;
      }
    }
  }

  return 0;
}

function isIdentityQuestion(text) {
  var trimmed = text.trim().toLowerCase();
  var matched = false;
  for (var kwi = 0; kwi < IDENTITY_KW.length; kwi++) {
    if (trimmed.indexOf(IDENTITY_KW[kwi]) !== -1) { matched = true; break; }
  }
  if (matched && !/(你您|who|your name|who made|who created|who developed)/i.test(text)) {
    matched = false;
  }
  return matched;
}

function handleIdentityReply(text) {
  var aiReply = addMessageData("assistant", IDENTITY_REPLY);
  var aiMsgDiv = document.createElement("div");
  aiMsgDiv.className = "message ai";
  aiMsgDiv.dataset.msgId = aiReply.id;
  aiMsgDiv.innerHTML = '<div class="msg-bubble">' + renderContent(IDENTITY_REPLY) + "</div>";
  var bubble = aiMsgDiv.querySelector(".msg-bubble");
  renderRefs.chatMessages.appendChild(aiMsgDiv);
  attachSpeakButtonToBubble(bubble, IDENTITY_REPLY);
  attachLongPressToBubble(bubble, aiMsgDiv, aiReply);
  scrollToBottom(true);
  saveChatHistory();
  toggleSendButton(false);
  if (!isLoggedIn()) {
    incrementGuestMessageCount();
  }
}

function createAIMessagePlaceholder() {
  var aiMsgDiv = document.createElement("div");
  aiMsgDiv.className = "message ai";
  aiMsgDiv.innerHTML =
    '<div class="msg-bubble">正在思考' +
    '<div class="typing-indicator">' +
    '<div class="typing-dot"></div>' +
    '<div class="typing-dot"></div>' +
    '<div class="typing-dot"></div>' +
    "</div></div>";
  renderRefs.chatMessages.appendChild(aiMsgDiv);
  var bubble = aiMsgDiv.querySelector(".msg-bubble");
  scrollToBottom(true);
  setTimeout(function () { scrollToBottom(true); }, 50);
  return { aiMsgDiv: aiMsgDiv, bubble: bubble };
}

function buildHistoryMessages() {
  var historyMessages = [{ role: "system", content: SYSTEM_PROMPT }];
  var msgs = chatData();
  msgs.forEach(function (m) {
    historyMessages.push({ role: m.role, content: m.content });
  });
  return historyMessages;
}

async function fetchWithRetry(historyMessages) {
  var response = null;
  var retryCount = 0;
  while (retryCount <= CONFIG.MAX_RETRIES) {
    try {
      response = await doFetch(historyMessages);
      if (response.ok) break;
      var errorText = await response.text();
      if (response.status >= 500 && response.status < 600 && retryCount < CONFIG.MAX_RETRIES) {
        retryCount++;
        await delay(CONFIG.RETRY_BASE_DELAY * retryCount);
        continue;
      }
      throw new Error("API 请求失败：" + response.status + " " + errorText);
    } catch (err) {
      if (err.name === "AbortError") throw err;
      if (retryCount < CONFIG.MAX_RETRIES) {
        retryCount++;
        await delay(CONFIG.RETRY_BASE_DELAY * retryCount);
        continue;
      }
      throw err;
    }
  }
  return response;
}

function finalRender(bubble, aiMsgDiv, textForBubble, msgObjToAttach, lastUserQuestion) {
  var extracted = extractFollowUpQuestions(textForBubble);
  var bodyForBubble = extracted.body;
  var questions = extracted.questions;
  if (!questions || questions.length === 0) {
    questions = generateFallbackQuestions(bodyForBubble, lastUserQuestion);
  }
  var rendered = "";
  try {
    rendered = renderContent(bodyForBubble);
  } catch (e) {
    rendered = "";
  }
  if (!rendered || rendered.replace(/<[^>]+>/g, "").replace(/\s+/g, "").length <
      bodyForBubble.replace(/\s+/g, "").length * 0.5) {
    bubble.innerHTML = escapeHtml(bodyForBubble).replace(/\n/g, "<br>");
  } else {
    bubble.innerHTML = rendered;
  }
  attachSpeakButtonToBubble(bubble, bodyForBubble);
  attachLongPressToBubble(bubble, aiMsgDiv, msgObjToAttach || { role: "assistant", content: bodyForBubble });
  autoScaleKatex(bubble);
  renderFollowUpButtons(bubble, questions);
}

async function streamResponse(reader, bubble) {
  // -------------------- 生产-消费状态 --------------------
  var decoder = new TextDecoder("utf-8", { fatal: false });
  var lineBuffer = "";
  var fullContent = "";        // 上游已到达的全部文本
  var consumed = 0;            // 打字机已消费到 fullContent 的字符位置
  var firstTokenTs = 0;
  var t0 = Date.now();
  var producerDone = false;

  // -------------------- DOM 状态 --------------------
  // bubble 结构：
  //   [committed HTML]      ← 已提交段（renderContentLight 渲染）
  //   <span class="stream-cursor">▎</span>
  //     └─ TextNode          ← 打字机逐字追加
  var hasClearedPlaceholder = false;
  var cursorSpan = null;
  var cursorText = null;
  var streamMode = "light";   // light | plaintext
  var streamTextNode = null;  // plaintext 模式下的文本节点
  var streamPlaintextLen = 0; // plaintext 模式下已写入的字符数
  var lastScrollTs = 0;

  // -------------------- 工具函数 --------------------
  function ensureCleared() {
    if (hasClearedPlaceholder) return;
    bubble.innerHTML = "";
    hasClearedPlaceholder = true;
  }

  function ensureCursor() {
    if (cursorSpan && cursorSpan.parentNode) return;
    ensureCleared();
    cursorSpan = document.createElement("span");
    cursorSpan.className = "stream-cursor";
    cursorText = document.createTextNode("");
    cursorSpan.appendChild(cursorText);
    bubble.appendChild(cursorSpan);
  }

  /** 把 [0, commitEnd) 的已消费内容提交为正式段，剩余部分继续走 cursor。
   *  commitEnd === 0 表示不提交，仅刷新 cursor 内容。 */
  function commit(commiEnd) {
    if (commiEnd <= 0) return;
    var committedText = fullContent.substring(0, commiEnd);
    var remaining = fullContent.substring(commiEnd);

    // 长内容切换 plaintext 模式：直接用整段重写并放弃 cursor
    if (streamMode === "light" && committedText.length > TYPER.PLAINTEXT_THRESHOLD) {
      // 切换为 plaintext 模式：保留整段已消费内容，cursor 暂时丢弃
      streamMode = "plaintext";
      bubble.innerHTML = "";
      var ptSpan = document.createElement("span");
      ptSpan.className = "stream-plaintext";
      ptSpan.style.whiteSpace = "pre-wrap";
      ptSpan.style.wordBreak = "break-word";
      ptSpan.textContent = committedText + remaining;
      bubble.appendChild(ptSpan);
      streamTextNode = ptSpan.firstChild;
      streamPlaintextLen = committedText.length + remaining.length;
      // plaintext 模式不再走 commit/cursor 流程，直接消费到末尾
      consumed = fullContent.length;
      return;
    }

    if (streamMode === "plaintext") {
      // plaintext 模式：增量追加（如果还没追上）
      var target = committedText.length + remaining.length;
      if (target > streamPlaintextLen && streamTextNode) {
        streamTextNode.appendData(fullContent.substring(streamPlaintextLen, target));
        streamPlaintextLen = target;
      }
      consumed = target;
      return;
    }

    // light 模式：把已提交段用 renderContentLight 渲染为 HTML，
    // 然后重建 cursor 并填入 remaining 文本。
    var html;
    try {
      html = renderContentLight(committedText);
    } catch (e) {
      html = escapeHtml(committedText).replace(/\n/g, "<br>");
    }
    // 保留 remaining 作为 cursor 初始内容
    bubble.innerHTML = html;
    cursorSpan = document.createElement("span");
    cursorSpan.className = "stream-cursor";
    cursorText = document.createTextNode(remaining);
    cursorSpan.appendChild(cursorText);
    bubble.appendChild(cursorSpan);
    consumed = commiEnd;
  }

  /** 仅刷新 cursor 文本（不提交段）。
   *  每帧打字机追加字符后调用。 */
  function refreshCursor() {
    if (streamMode !== "light") return;
    if (!cursorText) {
      ensureCursor();
    }
    if (cursorText) {
      cursorText.data = fullContent.substring(consumed);
    }
  }

  /** plaintext 模式：增量追加 unconsumed 部分。 */
  function refreshPlaintext() {
    if (streamMode !== "plaintext" || !streamTextNode) return;
    var target = fullContent.length;
    if (target > streamPlaintextLen) {
      streamTextNode.appendData(fullContent.substring(streamPlaintextLen, target));
      streamPlaintextLen = target;
      consumed = target;
    }
  }

  function maybeScroll(force) {
    var nowTs = Date.now();
    if (streamMode === "plaintext") {
      if (force || nowTs - lastScrollTs >= TYPER.SCROLL_THROTTLE_MS) {
        lastScrollTs = nowTs;
        scrollToBottom(false);
      }
      return;
    }
    // light 模式：行数较少时跟随滚动
    if (force || estimateLineCount(fullContent) <= TYPER.AUTO_SCROLL_LINE_LIMIT) {
      scrollToBottom(false);
    }
  }

  /** 消费者：每帧消费若干字符到 cursor，命中边界则提交段。 */
  function consumeFrame() {
    if (consumed >= fullContent.length) {
      // 没有新内容可消费，仅滚动
      maybeScroll(false);
      return;
    }
    // 自适应速度：根据 buffer 剩余决定每帧字符数
    var pending = fullContent.length - consumed;
    var charsThisFrame;
    if (pending >= TYPER.BUFFER_HIGH_WATER) {
      charsThisFrame = TYPER.MAX_CHARS_PER_FRAME;
    } else if (pending <= TYPER.BUFFER_LOW_WATER) {
      charsThisFrame = TYPER.MIN_CHARS_PER_FRAME;
    } else {
      // 线性插值
      var ratio = (pending - TYPER.BUFFER_LOW_WATER) /
                  (TYPER.BUFFER_HIGH_WATER - TYPER.BUFFER_LOW_WATER);
      charsThisFrame = Math.max(
        TYPER.MIN_CHARS_PER_FRAME,
        Math.round(TYPER.MIN_CHARS_PER_FRAME +
                   ratio * (TYPER.MAX_CHARS_PER_FRAME - TYPER.MIN_CHARS_PER_FRAME))
      );
    }
    var newConsumed = Math.min(consumed + charsThisFrame, fullContent.length);

    if (streamMode === "plaintext") {
      // plaintext 模式：直接消费到末尾（不再分段）
      consumed = fullContent.length;
      refreshPlaintext();
      maybeScroll(false);
      return;
    }

    // light 模式：检查是否命中稳定边界
    var upTo = fullContent.substring(0, newConsumed);
    var boundary = findCommitBoundary(upTo);
    if (boundary > consumed && boundary <= newConsumed) {
      // 提交到 boundary
      commit(boundary);
      // cursor 内剩余部分（含本次新增字符）已通过 commit 内部重建填好
    } else {
      // 仅更新 cursor 文本
      consumed = newConsumed;
      refreshCursor();
    }
    maybeScroll(false);
  }

  function parseSSELine(rawLine) {
    if (rawLine === "") return null;
    if (rawLine.charAt(rawLine.length - 1) === "\r") rawLine = rawLine.slice(0, -1);
    if (rawLine.charAt(0) === ":") return null;
    if (!rawLine.startsWith("data:")) return null;
    var payload = rawLine.substring(5);
    if (payload.charAt(0) === " ") payload = payload.substring(1);
    if (payload === "[DONE]") return null;
    try {
      var data = JSON.parse(payload);
      var delta =
        data.choices &&
        data.choices[0] &&
        data.choices[0].delta &&
        data.choices[0].delta.content;
      return delta || null;
    } catch (e) {
      return null;
    }
  }

  // -------------------- 启动消费者 (rAF) --------------------
  var rafId = null;
  var consumeResolve = null;
  var consumePromise = new Promise(function (resolve) { consumeResolve = resolve; });

  function tick() {
    try {
      consumeFrame();
    } catch (e) {
      // 消费过程中出错不应中断流式读取
      console.warn("[灵知-流式] 消费帧出错:", e);
    }
    if (producerDone && consumed >= fullContent.length) {
      // 流结束且消费完毕 → 退出循环
      rafId = null;
      if (consumeResolve) {
        var r = consumeResolve;
        consumeResolve = null;
        r();
      }
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  // -------------------- 生产者：读取 SSE --------------------
  rafId = requestAnimationFrame(tick);

  try {
    while (true) {
      var result = await reader.read();
      if (result.done) break;
      lineBuffer += decoder.decode(result.value, { stream: true });
      var lfIdx;
      while ((lfIdx = lineBuffer.indexOf("\n")) !== -1) {
        var rawLine = lineBuffer.substring(0, lfIdx);
        lineBuffer = lineBuffer.substring(lfIdx + 1);
        var delta = parseSSELine(rawLine);
        if (delta) {
          if (fullContent.length === 0) firstTokenTs = Date.now();
          fullContent += delta;
        }
      }
    }

    // 处理尾部残余
    try {
      var decoderTail = decoder.decode();
      if (decoderTail) lineBuffer += decoderTail;
    } catch (e) {}

    if (lineBuffer && lineBuffer.charAt(0) !== ":") {
      if (lineBuffer.charAt(lineBuffer.length - 1) === "\r") lineBuffer = lineBuffer.slice(0, -1);
      if (lineBuffer.startsWith("data:")) {
        var lastDelta = parseSSELine(lineBuffer);
        if (lastDelta) {
          if (fullContent.length === 0) firstTokenTs = Date.now();
          fullContent += lastDelta;
        }
      }
    }
  } finally {
    producerDone = true;
  }

  // 等待消费者把剩余字符消费完（带超时兜底，避免 rAF 被后台节流卡住）
  if (consumed < fullContent.length) {
    var timeoutId = setTimeout(function () {
      // 超时强制消费完
      if (streamMode === "plaintext") {
        refreshPlaintext();
      } else {
        commit(fullContent.length);
      }
      if (consumeResolve) {
        var r = consumeResolve;
        consumeResolve = null;
        r();
      }
    }, TYPER.FLUSH_FINAL_TIMEOUT_MS);

    await consumePromise;
    clearTimeout(timeoutId);
  }

  // -------------------- 收尾 --------------------
  // 流结束 + 消费完毕后，cursor 残余文本仍保留在 DOM 中，
  // 由调用方 finalRender 重写整个 bubble 接管最终渲染。
  if (rafId) cancelAnimationFrame(rafId);

  return {
    fullContent: fullContent,
    ttfbMs: firstTokenTs ? firstTokenTs - t0 : null,
    totalMs: Date.now() - t0
  };
}

function handleError(err, aiMsgDiv, bubble, fullContent) {
  if (err.name === "AbortError") {
    return { handled: false, partialContent: fullContent };
  }
  var errMsg = { role: "assistant", content: "❌ 出错了：" + err.message };
  bubble.innerHTML = renderContent("❌ 出错了：" + err.message);
  attachSpeakButtonToBubble(bubble, fullContent || ("❌ 出错了：" + err.message));
  attachLongPressToBubble(bubble, aiMsgDiv, errMsg);
  console.error(err);
  return { handled: true, partialContent: "" };
}

export async function sendMessage() {
  if (state.isGenerating) {
    stopGeneration();
    return;
  }

  var text = renderRefs.chatInput.value.trim();
  if (!text) return;

  if (!isLoggedIn()) {
    var guestCount = getGuestMessageCount();
    if (guestCount >= CONFIG.GUEST_MAX_MESSAGES) {
      showGuestLimitModal();
      return;
    }
  }

  renderRefs.chatInput.value = "";
  renderRefs.chatInput.style.height = "auto";
  toggleSendButton(true);

  stopAllSpeak();
  updateHeaderPlayBtn();

  var emptyTip = renderRefs.chatMessages.querySelector(".chat-empty-tip");
  if (emptyTip) emptyTip.remove();

  var userMsg = addMessageData("user", text);
  var userMsgDiv = createMessageElement(userMsg);
  renderRefs.chatMessages.appendChild(userMsgDiv);
  scrollToBottom(true);

  if (isIdentityQuestion(text)) {
    handleIdentityReply(text);
    return;
  }

  var placeholder = createAIMessagePlaceholder();
  var aiMsgDiv = placeholder.aiMsgDiv;
  var bubble = placeholder.bubble;

  var historyMessages = buildHistoryMessages();

  state.abortController = new AbortController();

  var lastUserQuestion = text;

  try {
    var response = await fetchWithRetry(historyMessages);

    var reader = response.body.getReader();
    var streamResult = await streamResponse(reader, bubble);
    var fullContent = streamResult.fullContent;

    if (!fullContent.trim()) throw new Error("未收到有效响应");

    fullContent = sanitizeIdentity(fullContent);

    var aiMsg = addMessageData("assistant", fullContent);
    aiMsgDiv.dataset.msgId = aiMsg.id;
    finalRender(bubble, aiMsgDiv, fullContent, aiMsg, lastUserQuestion);

    console.log(
      "[灵知-流式] 全文 " + fullContent.length + " 字符" +
      " | 首 token: " + (streamResult.ttfbMs ? streamResult.ttfbMs + "ms" : "-") +
      " | 总耗时: " + streamResult.totalMs + "ms"
    );

    saveChatHistory();

    if (!isLoggedIn()) {
      incrementGuestMessageCount();
    }

  } catch (err) {
    if (err.name === "AbortError") {
      if (fullContent && fullContent.trim()) {
        var cleaned = sanitizeIdentity(fullContent);
        var partialMsg = addMessageData("assistant", cleaned);
        aiMsgDiv.dataset.msgId = partialMsg.id;
        finalRender(bubble, aiMsgDiv, cleaned, partialMsg, lastUserQuestion);
        saveChatHistory();
      } else {
        aiMsgDiv.remove();
      }
    } else {
      var errMsg = { role: "assistant", content: "❌ 出错了：" + err.message };
      bubble.innerHTML = renderContent("❌ 出错了：" + err.message);
      attachSpeakButtonToBubble(bubble, "❌ 出错了：" + err.message);
      attachLongPressToBubble(bubble, aiMsgDiv, errMsg);
      console.error(err);
    }
  } finally {
    toggleSendButton(false);
    state.abortController = null;
  }
}
 
// ================================================================
// API 请求
// ================================================================
 
function doFetch(historyMessages) {
  var headers = { "Content-Type": "application/json" };
  var token = authToken();
  if (token) {
    headers["Authorization"] = "Bearer " + token;
  }
  return fetch(CONFIG.API_URL, {
    method: "POST",
    headers: headers,
    signal: state.abortController.signal,
    body: JSON.stringify({
      model: CONFIG.MODEL,
      messages: historyMessages,
      temperature: CONFIG.TEMPERATURE,
      max_tokens: CONFIG.MAX_TOKENS,
      stream: true,
    }),
  });
}
 
// ================================================================
// 访客消息限制
// ================================================================
 
function getGuestMessageCount() {
  try {
    var count = parseInt(localStorage.getItem(CONFIG.GUEST_MSG_KEY) || '0', 10);
    return isNaN(count) ? 0 : count;
  } catch (e) {
    return 0;
  }
}
 
function incrementGuestMessageCount() {
  try {
    var count = getGuestMessageCount();
    count++;
    localStorage.setItem(CONFIG.GUEST_MSG_KEY, String(count));
    return count;
  } catch (e) {
    return 0;
  }
}
 
function showGuestLimitModal() {
  var overlay = document.getElementById('authOverlay');
  var title = document.getElementById('authTitle');
  var nicknameField = document.getElementById('authNicknameField');
  var switchText = document.getElementById('authSwitchText');
  var switchBtn = document.getElementById('authSwitchBtn');
  var submitBtn = document.getElementById('authSubmitBtn');
  var errorEl = document.getElementById('authError');
 
  if (!overlay) return;
 
  title.textContent = '登录';
  if (nicknameField) nicknameField.style.display = 'none';
  if (switchText) switchText.textContent = '还没有账号？';
  if (switchBtn) switchBtn.textContent = '去注册';
  if (submitBtn) submitBtn.textContent = '登录';
  if (errorEl) errorEl.textContent = '您已达到免费消息上限（' + CONFIG.GUEST_MAX_MESSAGES + '条），请登录后继续使用';
 
  document.getElementById('authEmail').value = '';
  document.getElementById('authPassword').value = '';
  var nickInput = document.getElementById('authNickname');
  if (nickInput) nickInput.value = '';
 
  overlay.classList.add('show');
  setTimeout(function () {
    document.getElementById('authEmail').focus();
  }, 100);
}
