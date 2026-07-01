
/**
 * DOM 渲染模块
 * 包含消息元素创建、侧栏渲染、相关问题按钮等 DOM 操作
 */
 
import {
  renderContent,
  renderUserText,
  autoScaleKatex,
  extractFollowUpQuestions,
  generateFallbackQuestions

} from './utils.js?v=1.1.11';
import {
  state,
  currentSession,
  chatData,
  truncateMessagesFrom

} from './state.js?v=1.1.11';
import { CONFIG } from './config.js?v=1.1.11';
import { attachSpeakButton } from './tts.js?v=1.1.11';
 
// 导出到全局，供 chat.js 和 app.js 使用
// 用对象包装避免 ES Module 只读绑定问题
export var domRefs = {
  chatMessages: null,
  chatInput: null,
};
 
// ================================================================
// DOM 引用获取
// ================================================================
 
export function getDOMElements() {
  domRefs.chatMessages = document.getElementById("chatMessages");
  domRefs.chatInput = document.getElementById("chatInput");
  return {
    chatMessages: domRefs.chatMessages,
    chatInput: domRefs.chatInput,
    chatSendBtn: document.getElementById("chatSendBtn"),
    chatNewBtn: document.getElementById("chatNewBtn"),
    chatThemeBtn: document.getElementById("chatThemeBtn"),
    chatAutoPlayBtn: document.getElementById("chatAutoPlayBtn"),
    chatConfirmOverlay: document.getElementById("chatConfirmOverlay"),
    chatConfirmCancel: document.getElementById("chatConfirmCancel"),
    chatConfirmOk: document.getElementById("chatConfirmOk"),
    chatConfirmTitle: document.getElementById("chatConfirmTitle"),
    chatConfirmWarn: document.getElementById("chatConfirmWarn"),
    chatSidebar: document.getElementById("chatSidebar"),
    chatSidebarOverlay: document.getElementById("chatSidebarOverlay"),
    chatSidebarClose: document.getElementById("chatSidebarClose"),
    chatSidebarNewBtn: document.getElementById("chatSidebarNewBtn"),
    chatSidebarRefreshBtn: document.getElementById("chatSidebarRefreshBtn"),
    chatSidebarList: document.getElementById("chatSidebarList"),
  };
}
 
// ================================================================
// 消息渲染
// ================================================================
 
/** 渲染空状态 */
export function renderEmptyState() {
  domRefs.chatMessages.innerHTML = buildEmptyTipHTML();
}
 
function buildEmptyTipHTML() {
  return (
    '<div class="chat-empty-tip">' +
    '<span class="big">👋</span>' +
    "你好！我是灵知" +
    "</div>"
  );
}
 
/** 渲染当前会话到 DOM */
export function renderCurrentSession() {
  var s = currentSession();
  if (!s || s.messages.length === 0) {
    renderEmptyState();
    return;
  }
  domRefs.chatMessages.innerHTML = "";
 
  var frag = document.createDocumentFragment();
  for (var mi = 0; mi < s.messages.length; mi++) {
    var m = s.messages[mi];
    if (!m.content || !m.content.trim()) continue;
    frag.appendChild(createMessageElement(m));
  }
  domRefs.chatMessages.appendChild(frag);
  scrollToBottom(true);
}
 
/** 创建消息 DOM 元素 */
export function createMessageElement(msg) {
  var div = document.createElement("div");
  div.className = "message " + (msg.role === "user" ? "user" : "ai");
  div.dataset.msgId = msg.id;
 
  var bubble = document.createElement("div");
  bubble.className = "msg-bubble";
 
  if (msg.role === "user") {
    bubble.innerHTML = renderUserText(msg.content);
  } else {
    var extracted = extractFollowUpQuestions(msg.content);
    var bodyForBubble = extracted.body;
    var questions = extracted.questions;
 
    if (!questions || questions.length === 0) {
      questions = generateFallbackQuestions(bodyForBubble, null);
    }
 
    bubble.innerHTML = renderContent(bodyForBubble);
    div.appendChild(bubble);
    attachLongPressToBubble(bubble, div, msg);
    attachSpeakButton(bubble, bodyForBubble);
    autoScaleKatex(bubble);
    renderFollowUpButtons(bubble, questions);
    return div;
  }
 
  attachLongPressToBubble(bubble, div, msg);
  div.appendChild(bubble);
  return div;
}
 
// ================================================================
// 长按/右键菜单
// ================================================================
 
export var currentActionMenu = null;
 
export function hideMsgActionMenu() {
  if (currentActionMenu) {
    currentActionMenu.remove();
    currentActionMenu = null;
  }
}
 
var _textSelectModeBubble = null;
 
export function enterBubbleTextSelectMode(bubble) {
  if (_textSelectModeBubble && _textSelectModeBubble !== bubble) {
    _textSelectModeBubble.classList.remove('is-text-select-mode');
  }
  _textSelectModeBubble = bubble;
  bubble.classList.add('is-text-select-mode');
 
  setTimeout(function () {
    function onOutside(e) {
      if (!bubble.parentNode) return;
      if (e.target === bubble || bubble.contains(e.target)) return;
      bubble.classList.remove('is-text-select-mode');
      if (_textSelectModeBubble === bubble) _textSelectModeBubble = null;
      document.removeEventListener('click', onOutside, true);
      document.removeEventListener('touchstart', onOutside, true);
    }
    document.addEventListener('click', onOutside, true);
    document.addEventListener('touchstart', onOutside, true);
  }, 50);
}
 
/** 给气泡绑定长按/右键操作菜单 */
export function attachLongPressToBubble(bubble, msgDiv, msg) {
  var longPressTimer = null;
  var startX = 0;
  var startY = 0;
 
  function getClientX(e) {
    if (e.touches && e.touches.length > 0) return e.touches[0].clientX;
    if (e.changedTouches && e.changedTouches.length > 0) return e.changedTouches[0].clientX;
    return e.clientX || 0;
  }
  function getClientY(e) {
    if (e.touches && e.touches.length > 0) return e.touches[0].clientY;
    if (e.changedTouches && e.changedTouches.length > 0) return e.changedTouches[0].clientY;
    return e.clientY || 0;
  }
 
  function inTextSelectMode() {
    return bubble.classList.contains('is-text-select-mode');
  }
 
  function startLongPress(e) {
    if (inTextSelectMode()) return;
    startX = getClientX(e);
    startY = getClientY(e);
    longPressTimer = setTimeout(function () {
      if (navigator.vibrate) navigator.vibrate(15);
      showMsgActionMenu(msgDiv, bubble, msg, startX, startY);
    }, 500);
  }
 
  function cancelLongPress() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }
 
  function handleMove(e) {
    if (!longPressTimer) return;
    var cx = getClientX(e);
    var cy = getClientY(e);
    if (Math.abs(cx - startX) > 10 || Math.abs(cy - startY) > 10) {
      cancelLongPress();
    }
  }
 
  bubble.addEventListener("touchstart", startLongPress, { passive: true });
  bubble.addEventListener("touchend", cancelLongPress);
  bubble.addEventListener("touchmove", handleMove, { passive: true });
  bubble.addEventListener("touchcancel", cancelLongPress);
  bubble.addEventListener("contextmenu", function (e) {
    if (inTextSelectMode()) return;
    e.preventDefault();
    showMsgActionMenu(msgDiv, bubble, msg, e.clientX || startX, e.clientY || startY);
  });
  bubble.addEventListener("mousedown", startLongPress);
  bubble.addEventListener("mouseup", cancelLongPress);
  bubble.addEventListener("mouseleave", cancelLongPress);
}
 
export function showMsgActionMenu(msgDiv, bubble, msg, clickX, clickY) {
  hideMsgActionMenu();
 
  var menu = document.createElement("div");
  menu.className = "msg-action-menu";
 
  var items = [
    { icon: "📋", label: "复制", action: function () { copyMessageText(msg.content); } },
    { icon: "✍️", label: "文本", action: function () { enterBubbleTextSelectMode(bubble); } },
    { icon: "🗑", label: "删除", action: function () { confirmDeleteMessage(msgDiv); } },
  ];
 
  if (msg.role === "assistant" || msg.role === "ai") {
    items.push({
      icon: "🔄",
      label: "重新回答",
      action: function () { regenerateMessage(msgDiv, msg); }
    });
  }
 
  for (var i = 0; i < items.length; i++) {
    if (i > 0) {
      var divider = document.createElement("div");
      divider.className = "msg-action-menu-divider";
      menu.appendChild(divider);
    }
    var itemEl = document.createElement("button");
    itemEl.type = "button";
    itemEl.className = "msg-action-menu-item";
    itemEl.innerHTML = '<span class="icon">' + items[i].icon + '</span><span>' + items[i].label + '</span>';
    (function (action, item) {
      item.addEventListener("click", function () {
        hideMsgActionMenu();
        action();
      });
    })(items[i].action, itemEl);
    menu.appendChild(itemEl);
  }
 
  document.body.appendChild(menu);
 
  var menuRect = menu.getBoundingClientRect();
  var vw = window.innerWidth;
  var vh = window.innerHeight;
  var margin = 12;
  var fingerGap = 14;
 
  var posX = (clickX || vw / 2);
  var menuLeft = posX - menuRect.width / 2;
  menuLeft = Math.max(margin, Math.min(menuLeft, vw - menuRect.width - margin));
 
  var posY = (clickY || vh / 2);
  var menuTop;
  if (posY - fingerGap - menuRect.height >= margin) {
    menuTop = posY - fingerGap - menuRect.height;
  } else {
    menuTop = posY + fingerGap;
  }
  menuTop = Math.max(margin, Math.min(menuTop, vh - menuRect.height - margin));
 
  menu.style.left = Math.round(menuLeft) + "px";
  menu.style.top = Math.round(menuTop) + "px";
 
  currentActionMenu = menu;
}
 
export function copyMessageText(text) {
  var plain = text || "";
  if (window.clipboardData && window.clipboardData.setData) {
    try { window.clipboardData.setData("Text", plain); } catch (e) {}
    return;
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(plain).catch(function () {});
    return;
  }
  try {
    var ta = document.createElement("textarea");
    ta.value = plain;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  } catch (e) {}
}
 
export function confirmDeleteMessage(msgDiv) {
  state.pendingOperation = { type: 'msg', msgDiv: msgDiv };
  document.getElementById("chatConfirmTitle").textContent = "确认删除这条消息？";
  document.getElementById("chatConfirmWarn").textContent = "删除后无法恢复";
  showConfirm();
}
 
export function confirmDeleteSession(id) {
  state.pendingOperation = { type: 'session', id: id };
  document.getElementById("chatConfirmTitle").textContent = "确认删除这个话题？";
  document.getElementById("chatConfirmWarn").textContent = "该话题的所有聊天记录将被删除";
  showConfirm();
}
 
export function confirmClearAll() {
  state.pendingOperation = { type: 'clearAll' };
  document.getElementById("chatConfirmTitle").textContent = "确认清空聊天记录？";
  document.getElementById("chatConfirmWarn").textContent = "此操作不可恢复";
  showConfirm();
}
 
export function showConfirm() {
  document.getElementById("chatConfirmOverlay").classList.add("show");
  document.getElementById("chatConfirmOverlay").setAttribute("aria-hidden", "false");
  setTimeout(function () { document.getElementById("chatConfirmCancel").focus(); }, 50);
}
 
export function hideConfirm() {
  document.getElementById("chatConfirmOverlay").classList.remove("show");
  document.getElementById("chatConfirmOverlay").setAttribute("aria-hidden", "true");
  state.pendingOperation = null;
}
 
/** 重新回答 */
export function regenerateMessage(msgDiv, msg) {
  if (state.isGenerating) return;
 
  var s = currentSession();
  if (!s) return;
  var msgs = s.messages;
  var aiIdx = -1;
  for (var i = 0; i < msgs.length; i++) {
    if (msgs[i].id === msg.id) { aiIdx = i; break; }
  }
  if (aiIdx < 0) return;
  if (msgs[aiIdx].role !== "assistant") return;
 
  var userIdx = -1;
  for (var j = aiIdx - 1; j >= 0; j--) {
    if (msgs[j].role === "user") { userIdx = j; break; }
  }
  if (userIdx < 0) return;
 
  var userQuestion = msgs[userIdx].content;
  var userMsgId = msgs[userIdx].id;
 
  truncateMessagesFrom(userMsgId);
 
  var allMsgDivs = domRefs.chatMessages.querySelectorAll(".message");
  var started = false;
  for (var k = 0; k < allMsgDivs.length; k++) {
    if (!started && parseInt(allMsgDivs[k].dataset.msgId, 10) === userMsgId) {
      started = true;
    }
    if (started) {
      allMsgDivs[k].parentNode.removeChild(allMsgDivs[k]);
    }
  }
 
  if (!started) {
    var allMsgDivs2 = domRefs.chatMessages.querySelectorAll(".message");
    var started2 = false;
    for (var k2 = 0; k2 < allMsgDivs2.length; k2++) {
      if (allMsgDivs2[k2] === msgDiv) started2 = true;
      if (started2) allMsgDivs2[k2].parentNode.removeChild(allMsgDivs2[k2]);
    }
  }
 
  domRefs.chatInput.value = userQuestion;
  document.dispatchEvent(new CustomEvent('chat:regenerate', { detail: { question: userQuestion } }));
}
 
// ================================================================
// 侧栏渲染
// ================================================================
 
export function openSidebar() {
  renderSidebarList();
  document.getElementById("chatSidebar").classList.add("open");
  document.getElementById("chatSidebarOverlay").classList.add("show");
  document.getElementById("chatSidebar").setAttribute("aria-hidden", "false");
  document.getElementById("chatSidebarOverlay").setAttribute("aria-hidden", "false");
  setTimeout(function () {
    var closeBtn = document.getElementById("chatSidebarClose");
    if (closeBtn) closeBtn.focus();
  }, 200);
}
 
export function closeSidebar() {
  document.getElementById("chatSidebar").classList.remove("open");
  document.getElementById("chatSidebarOverlay").classList.remove("show");
  document.getElementById("chatSidebar").setAttribute("aria-hidden", "true");
  document.getElementById("chatSidebarOverlay").setAttribute("aria-hidden", "true");
}
 
export function renderSidebarList() {
  var chatSidebarList = document.getElementById("chatSidebarList");
  if (!chatSidebarList) return;
  chatSidebarList.innerHTML = "";
 
  var sessions = state.sessions || [];
  if (sessions.length === 0) {
    chatSidebarList.innerHTML = '<div class="chat-sidebar-empty">暂无聊天记录</div>';
    return;
  }
 
  var currentSessionId = state.currentSessionId;
  sessions.forEach(function (s) {
    var item = document.createElement("div");
    item.className = "chat-sidebar-item" + (s.id === currentSessionId ? " active" : "");
 
    var icon = document.createElement("span");
    icon.className = "chat-sidebar-item-icon";
    icon.textContent = s.messages.length > 0 ? "💬" : "📝";
 
    var info = document.createElement("div");
    info.className = "chat-sidebar-item-info";
 
    var title = document.createElement("div");
    title.className = "chat-sidebar-item-title";
    title.textContent = s.title || "新话题";
 
    var preview = document.createElement("div");
    preview.className = "chat-sidebar-item-preview";
    var lastMsg = s.messages[s.messages.length - 1];
    preview.textContent = lastMsg
      ? (lastMsg.role === "user" ? "我: " : "AI: ") + lastMsg.content.substring(0, 30)
      : "暂无消息";
 
    info.appendChild(title);
    info.appendChild(preview);
 
    item.appendChild(icon);
    item.appendChild(info);
 
    item.addEventListener("click", function (e) {
      if (e.target.closest(".chat-sidebar-item-delete")) return;
      window.switchSession(s.id);
      closeSidebar();
      renderCurrentSession();
    });
 
    var delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "chat-sidebar-item-delete";
    delBtn.textContent = "×";
    delBtn.setAttribute("aria-label", "删除此会话");
    delBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      confirmDeleteSession(s.id);
    });
    item.appendChild(delBtn);
 
    chatSidebarList.appendChild(item);
  });
}
 
// ================================================================
// 滚动控制
// ================================================================
 
export function scrollToBottom(force) {
  if (!domRefs.chatMessages) return;
  if (!force && domRefs.chatMessages.scrollHeight <= domRefs.chatMessages.clientHeight + 2) return;
  if (window.scrollRafId) {
    if (!force) return;
    cancelAnimationFrame(window.scrollRafId);
  }
  window.scrollRafId = requestAnimationFrame(function () {
    if (!domRefs.chatMessages) return;
    var distanceFromBottom =
      domRefs.chatMessages.scrollHeight - domRefs.chatMessages.scrollTop - domRefs.chatMessages.clientHeight;
    if (!force && distanceFromBottom < 4) {
      window.scrollRafId = null;
      return;
    }
    domRefs.chatMessages.scrollTop = domRefs.chatMessages.scrollHeight;
    window.scrollRafId = null;
  });
}
 
// ================================================================
// 追问按钮
// ================================================================
 
export function renderFollowUpButtons(containerEl, questions) {
  if (!containerEl || !questions || questions.length === 0) return;
 
  var container = document.createElement("div");
  container.className = "followup-container";
 
  var title = document.createElement("div");
  title.className = "followup-title";
  title.textContent = "你可能还想问：";
  container.appendChild(title);
 
  for (var i = 0; i < questions.length; i++) {
    (function (questionText) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "followup-item";
      btn.textContent = questionText;
      btn.addEventListener("click", function () {
        if (state.isGenerating) return;
        if (!domRefs.chatInput) return;
        domRefs.chatInput.value = questionText;
        domRefs.chatInput.style.height = "auto";
        if (window.sendMessage) window.sendMessage();
      });
      container.appendChild(btn);
    })(questions[i]);
  }
 
  containerEl.appendChild(container);
}
