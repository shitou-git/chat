
/**
 * 聊天模块
 * 包含消息发送、流式渲染、API 调用等核心逻辑
 */
 
import { CONFIG, SYSTEM_PROMPT, IDENTITY_REPLY, IDENTITY_KW } from './config.js?v=1.2.6';
import {
  state,
  addMessageData,
  chatData,
  currentSession,
  saveChatHistory
} from './state.js?v=1.2.6';
import {
  renderContent,
  renderContentLight,
  sanitizeIdentity,
  delay,
  autoScaleKatex,
  extractFollowUpQuestions,
  generateFallbackQuestions,
  escapeHtml
} from './utils.js?v=1.2.6';
import {
  renderCurrentSession,
  renderEmptyState,
  scrollToBottom,
  attachLongPressToBubble,
  createMessageElement,
  renderFollowUpButtons,
  domRefs as renderRefs
} from './render.js?v=1.2.6';
import {
  stopAllSpeak,
  updateHeaderPlayBtn,
  attachSpeakButton as attachSpeakButtonToBubble
} from './tts.js?v=1.2.6';
import { authToken, isLoggedIn } from './auth.js?v=1.2.6';
 
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
 
export async function sendMessage() {
  // 检查是否需要重新发送（重新回答触发）
  if (window._regenerateQuestion) {
    var q = window._regenerateQuestion;
    window._regenerateQuestion = null;
    renderRefs.chatInput.value = q;
  }
 
  // 如果正在生成，点击按钮 = 停止
  if (state.isGenerating) {
    stopGeneration();
    return;
  }
 
  var text = renderRefs.chatInput.value.trim();
  if (!text) return;
 
  // 未登录用户消息限制
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
 
  // 停止 TTS
  stopAllSpeak();
  updateHeaderPlayBtn();
 
  // 移除空状态
  var emptyTip = renderRefs.chatMessages.querySelector(".chat-empty-tip");
  if (emptyTip) emptyTip.remove();
 
  // 添加用户消息
  var userMsg = addMessageData("user", text);
  var userMsgDiv = createMessageElement(userMsg);
  renderRefs.chatMessages.appendChild(userMsgDiv);
  scrollToBottom(true);
 
  // 身份类问题检测
  var trimmed = text.trim().toLowerCase();
  var isIdentityQuestion = false;
  for (var kwi = 0; kwi < IDENTITY_KW.length; kwi++) {
    if (trimmed.indexOf(IDENTITY_KW[kwi]) !== -1) { isIdentityQuestion = true; break; }
  }
  if (isIdentityQuestion && !/(你您|who|your name|who made|who created|who developed)/i.test(text)) {
    isIdentityQuestion = false;
  }
 
  // 身份回复
  if (isIdentityQuestion) {
    var aiReply = addMessageData("assistant", IDENTITY_REPLY);
    var aiMsgDiv = document.createElement("div");
    aiMsgDiv.className = "message ai";
    aiMsgDiv.dataset.msgId = aiReply.id;
    aiMsgDiv.innerHTML = '<div class="msg-bubble">' + renderContent(IDENTITY_REPLY) + "</div>";
    var bubbleForId = aiMsgDiv.querySelector(".msg-bubble");
    renderRefs.chatMessages.appendChild(aiMsgDiv);
    attachSpeakButtonToBubble(bubbleForId, IDENTITY_REPLY);
    attachLongPressToBubble(bubbleForId, aiMsgDiv, aiReply);
    scrollToBottom(true);
    saveChatHistory();
    toggleSendButton(false);
 
    // 未登录用户消息计数
    if (!isLoggedIn()) {
      incrementGuestMessageCount();
    }
 
    return;
  }
 
  // 创建 AI 占位消息
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
 
  // 构建历史消息
  var historyMessages = [{ role: "system", content: SYSTEM_PROMPT }];
  var msgs = chatData();
  msgs.forEach(function (m) {
    historyMessages.push({ role: m.role, content: m.content });
  });
 
  state.abortController = new AbortController();
 
  // 流式渲染状态
  var fullContent = "";
  var pendingText = "";
  var lastAppendTs = 0;
  var lastUserQuestion = text;
  var firstTokenTs = 0;
  var t0 = Date.now();
  var AUTO_SCROLL_LINE_LIMIT = 12;
  var hasClearedPlaceholder = false;
  var STREAM_PLAINTEXT_THRESHOLD = 5000;
  var streamMode = "light";
  var streamTextNode = null;
  var streamPlaintextLen = 0;
  var lastScrollTs = 0;
 
  function getAppendThrottle(len) {
    if (len < 800) return 50;
    if (len < 2500) return 90;
    if (len < 6000) return 150;
    return 220;
  }
 
  function estimateLineCount(text) {
    if (!text) return 0;
    var m = text.match(/\n/g);
    return (m ? m.length : 0) + 1;
  }
 
  function flushStreamAppend(force) {
    var nowTs = Date.now();
    if (!force && lastAppendTs > 0 && nowTs - lastAppendTs < getAppendThrottle(fullContent.length)) return;
    if (!pendingText && !force) return;
 
    if (!hasClearedPlaceholder) {
      bubble.innerHTML = "";
      hasClearedPlaceholder = true;
    }
 
    var len = fullContent.length;
 
    if (streamMode === "light" && len > STREAM_PLAINTEXT_THRESHOLD) {
      var span = document.createElement("span");
      span.className = "stream-plaintext";
      span.style.whiteSpace = "pre-wrap";
      span.style.wordBreak = "break-word";
      span.textContent = fullContent;
      bubble.innerHTML = "";
      bubble.appendChild(span);
      streamTextNode = span.firstChild;
      streamPlaintextLen = len;
      streamMode = "plaintext";
    } else if (streamMode === "plaintext") {
      if (len > streamPlaintextLen && streamTextNode) {
        streamTextNode.appendData(fullContent.substring(streamPlaintextLen));
        streamPlaintextLen = len;
      }
    } else {
      try {
        bubble.innerHTML = renderContentLight(fullContent);
      } catch (e) {
        bubble.innerHTML = escapeHtml(fullContent).replace(/\n/g, "<br>");
      }
    }
 
    pendingText = "";
    lastAppendTs = nowTs;

    if (!force) {
      if (streamMode === "plaintext") {
        if (nowTs - lastScrollTs >= 120) {
          lastScrollTs = nowTs;
          scrollToBottom(false);
        }
      } else if (estimateLineCount(fullContent) <= AUTO_SCROLL_LINE_LIMIT) {
        scrollToBottom(false);
      }
    }
  }
 
  function finalRender(textForBubble, msgObjToAttach) {
    flushStreamAppend(true);
 
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
 
  try {
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
 
    // SSE 流式读取
    var reader = response.body.getReader();
    var decoder = new TextDecoder("utf-8", { fatal: false });
    var lineBuffer = "";
 
    while (true) {
      var result = await reader.read();
      if (result.done) break;
 
      lineBuffer += decoder.decode(result.value, { stream: true });
      var lfIdx;
      while ((lfIdx = lineBuffer.indexOf("\n")) !== -1) {
        var rawLine = lineBuffer.substring(0, lfIdx);
        lineBuffer = lineBuffer.substring(lfIdx + 1);
        if (rawLine.charAt(rawLine.length - 1) === "\r") rawLine = rawLine.slice(0, -1);
        if (rawLine === "") continue;
        if (rawLine.charAt(0) === ":") continue;
        if (!rawLine.startsWith("data:")) continue;
 
        var payload = rawLine.substring(5);
        if (payload.charAt(0) === " ") payload = payload.substring(1);
        if (payload === "[DONE]") continue;
 
        try {
          var data = JSON.parse(payload);
          var delta =
            data.choices &&
            data.choices[0] &&
            data.choices[0].delta &&
            data.choices[0].delta.content;
          if (!delta) continue;
 
          if (fullContent.length === 0) firstTokenTs = Date.now();
          fullContent += delta;
          pendingText += delta;
          flushStreamAppend(false);
        } catch (e) { /* 忽略 */ }
      }
    }
 
    try {
      var decoderTail = decoder.decode();
      if (decoderTail) lineBuffer += decoderTail;
    } catch (e) {}
 
    if (lineBuffer && lineBuffer.charAt(0) !== ":") {
      if (lineBuffer.charAt(lineBuffer.length - 1) === "\r") lineBuffer = lineBuffer.slice(0, -1);
      if (lineBuffer.startsWith("data:")) {
        var lastPayload = lineBuffer.substring(5);
        if (lastPayload.charAt(0) === " ") lastPayload = lastPayload.substring(1);
        if (lastPayload !== "[DONE]") {
          try {
            var lastData = JSON.parse(lastPayload);
            var lastDelta =
              lastData.choices &&
              lastData.choices[0] &&
              lastData.choices[0].delta &&
              lastData.choices[0].delta.content;
            if (lastDelta) {
              fullContent += lastDelta;
              pendingText += lastDelta;
            }
          } catch (e) {}
        }
      }
    }
 
    flushStreamAppend(true);
 
    if (!fullContent.trim()) throw new Error("未收到有效响应");
 
    fullContent = sanitizeIdentity(fullContent);
 
    var aiMsg = addMessageData("assistant", fullContent);
    aiMsgDiv.dataset.msgId = aiMsg.id;
    finalRender(fullContent, aiMsg);

    var ttfbMs = firstTokenTs ? firstTokenTs - t0 : null;
    console.log(
      "[灵知-流式] 全文 " + fullContent.length + " 字符" +
      " | 首 token: " + (ttfbMs ? ttfbMs + "ms" : "-") +
      " | 总耗时: " + (Date.now() - t0) + "ms"
    );
 
    saveChatHistory();
 
    // 未登录用户消息计数
    if (!isLoggedIn()) {
      incrementGuestMessageCount();
    }
 
  } catch (err) {
    if (err.name === "AbortError") {
      if (fullContent.trim()) {
        fullContent = sanitizeIdentity(fullContent);
        var partialMsg = addMessageData("assistant", fullContent);
        aiMsgDiv.dataset.msgId = partialMsg.id;
        finalRender(fullContent, partialMsg);
        saveChatHistory();
      } else {
        aiMsgDiv.remove();
      }
    } else {
      var errMsg = { role: "assistant", content: "❌ 出错了：" + err.message };
      bubble.innerHTML = renderContent("❌ 出错了：" + err.message);
      attachSpeakButtonToBubble(bubble, fullContent || ("❌ 出错了：" + err.message));
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
