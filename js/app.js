/**
 * 应用入口模块
 * 包含初始化、事件绑定、主题切换等
 */

import { CONFIG } from './config.js';
import { 
  loadSessions, 
  createSession,
  saveSessions,
  sessions,
  currentSessionId,
  autoPlayTTS,
  autoPlayTTSReady,
  pendingOperation,
  abortController
} from './state.js';
import { 
  getDOMElements,
  chatMessages,
  chatInput,
  renderCurrentSession,
  renderEmptyState,
  hideMsgActionMenu,
  showMsgActionMenu,
  currentActionMenu,
  hideConfirm,
  showConfirm,
  openSidebar,
  closeSidebar,
  confirmDeleteSession,
  renderSidebarList
} from './render.js';
import { 
  sendMessage,
  toggleSendButton,
  stopGeneration
} from './chat.js';
import {
  initVoices,
  initStreamTTS,
  updateHeaderPlayBtn,
  stopAllSpeak
} from './tts.js';
import { 
  deleteSession,
  removeMessageData,
  saveChatHistory,
  chatData
} from './state.js';

// ================================================================
// 事件绑定
// ================================================================

export function setupChat() {
  var dom = getDOMElements();

  // 输入框
  dom.chatInput.addEventListener("input", updateInputHeight);
  dom.chatInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      sendMessage();
    }
  });

  // 发送/停止按钮
  dom.chatSendBtn.addEventListener("click", sendMessage);

  // 新话题
  dom.chatNewBtn.addEventListener("click", startNewSession);
  dom.chatSidebarNewBtn.addEventListener("click", startNewSession);

  // 主题切换
  if (dom.chatThemeBtn) dom.chatThemeBtn.addEventListener("click", toggleTheme);

  // 自动播报
  if (dom.chatAutoPlayBtn) dom.chatAutoPlayBtn.addEventListener("click", toggleAutoPlay);

  // 侧栏
  var chatMenuBtn = document.getElementById("chatMenuBtn");
  if (chatMenuBtn) {
    chatMenuBtn.addEventListener("click", openSidebar);
    chatMenuBtn.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openSidebar();
      }
    });
  }
  dom.chatSidebarClose.addEventListener("click", closeSidebar);
  dom.chatSidebarOverlay.addEventListener("click", closeSidebar);

  // 确认弹窗
  dom.chatConfirmCancel.addEventListener("click", hideConfirm);
  dom.chatConfirmOk.addEventListener("click", onConfirmOk);
  dom.chatConfirmOverlay.addEventListener("click", function (e) {
    if (e.target === dom.chatConfirmOverlay) hideConfirm();
  });

  // Esc 关闭弹窗
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (currentActionMenu) {
        hideMsgActionMenu();
      } else if (dom.chatConfirmOverlay.classList.contains("show")) {
        hideConfirm();
      } else if (document.getElementById("chatSidebar").classList.contains("open")) {
        closeSidebar();
      }
    }
    trapFocus(e);
  });

  // 点击外部关闭菜单
  document.addEventListener("click", function (e) {
    if (currentActionMenu && !currentActionMenu.contains(e.target)) {
      hideMsgActionMenu();
    }
  }, true);
  document.addEventListener("touchstart", function (e) {
    if (currentActionMenu && !currentActionMenu.contains(e.target)) {
      hideMsgActionMenu();
    }
  }, { passive: true });

  // 滚动/改变尺寸关闭菜单
  window.addEventListener("scroll", hideMsgActionMenu, true);
  window.addEventListener("resize", hideMsgActionMenu);

  // 页面卸载
  window.addEventListener("beforeunload", function () {
    if (abortController) abortController.abort();
  });

  // 初始化会话
  loadSessions();
  initVoices();
  initStreamTTS();

  if (sessions.length === 0) {
    createSession();
  } else {
    window.currentSessionId = sessions[0].id;
  }
  renderCurrentSession();
  dom.chatInput.focus();

  // 初始化主题
  initTheme();

  // 初始化自动播报
  initAutoPlay();
}

// ================================================================
// 输入框高度自适应
// ================================================================

var _inputResizeRaf = null;

function updateInputHeight() {
  if (_inputResizeRaf) return;
  _inputResizeRaf = requestAnimationFrame(function () {
    _inputResizeRaf = null;
    var h = chatInput.scrollHeight;
    if (h > CONFIG.MAX_TEXTAREA_HEIGHT) h = CONFIG.MAX_TEXTAREA_HEIGHT;
    chatInput.style.height = "auto";
    chatInput.style.height = h + "px";
  });
}

// ================================================================
// 主题切换
// ================================================================

function initTheme() {
  var savedTheme = null;
  try { savedTheme = localStorage.getItem(CONFIG.THEME_STORAGE_KEY); } catch (e) {}
  applyTheme(savedTheme);
}

function applyTheme(theme) {
  if (theme === "dark") {
    document.body.classList.add("is-dark");
  } else if (theme === "light") {
    document.body.classList.remove("is-dark");
  } else {
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      document.body.classList.add("is-dark");
    } else {
      document.body.classList.remove("is-dark");
    }
  }
  var chatThemeBtn = document.getElementById("chatThemeBtn");
  if (chatThemeBtn) {
    chatThemeBtn.setAttribute(
      "title",
      document.body.classList.contains("is-dark") ? "切换到浅色模式" : "切换到深色模式"
    );
  }
}

function toggleTheme() {
  var isDark = document.body.classList.contains("is-dark");
  var next = isDark ? "light" : "dark";
  try { localStorage.setItem(CONFIG.THEME_STORAGE_KEY, next); } catch (e) {}
  applyTheme(next);
}

// ================================================================
// 自动播报
// ================================================================

function initAutoPlay() {
  var savedAutoPlay = null;
  try { savedAutoPlay = localStorage.getItem(CONFIG.AUTO_PLAY_KEY); } catch (e) {}
  applyAutoPlay(savedAutoPlay === "1");
  window.autoPlayTTSReady = true;
}

function applyAutoPlay(enabled) {
  window.autoPlayTTS = !!enabled;
  updateHeaderPlayBtn();
}

function toggleAutoPlay() {
  var streamTTS = window._streamTTS;
  if (streamTTS && (streamTTS.isPlaying || streamTTS.isPaused)) {
    if (streamTTS.isPlaying) {
      // 暂停
      if (streamTTS.audioEl) streamTTS.audioEl.pause();
      streamTTS.isPaused = true;
      streamTTS.isPlaying = false;
      updateHeaderPlayBtn();
    } else {
      // 继续
      streamTTS.isPaused = false;
      streamTTS.isPlaying = true;
      if (streamTTS.audioEl) streamTTS.audioEl.play().catch(function(){});
      updateHeaderPlayBtn();
    }
    return;
  }

  applyAutoPlay(!window.autoPlayTTS);
  try { localStorage.setItem(CONFIG.AUTO_PLAY_KEY, window.autoPlayTTS ? "1" : "0"); } catch (e) {}
}

// ================================================================
// 确认弹窗处理
// ================================================================

function onConfirmOk() {
  if (!pendingOperation) {
    hideConfirm();
    return;
  }

  if (pendingOperation.type === 'session') {
    var sid = pendingOperation.id;
    pendingOperation = null;
    hideConfirm();
    // 使用 render.js 中的 deleteSession
    window.deleteSession(sid);
    renderSidebarList();
    return;
  }

  if (pendingOperation.type === 'msg') {
    var id = parseInt(pendingOperation.msgDiv.dataset.msgId, 10);
    removeMessageData(id);
    pendingOperation.msgDiv.remove();
    pendingOperation = null;
    saveChatHistory();
    if (chatData().length === 0) renderEmptyState();
    hideConfirm();
    return;
  }

  if (pendingOperation.type === 'clearAll') {
    if (abortController) { abortController.abort(); abortController = null; }
    toggleSendButton(false);
    var s = currentSession();
    if (s) {
      s.messages = [];
      s.title = "新话题";
    }
    saveSessions();
    renderEmptyState();
    hideConfirm();
    return;
  }

  pendingOperation = null;
  hideConfirm();
}

function trapFocus(e) {
  var chatConfirmOverlay = document.getElementById("chatConfirmOverlay");
  if (!chatConfirmOverlay.classList.contains("show")) return;
  if (e.key !== "Tab") return;
  var focusable = chatConfirmOverlay.querySelectorAll("button");
  if (!focusable.length) return;
  var first = focusable[0];
  var last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

// ================================================================
// 新话题
// ================================================================

function startNewSession() {
  if (abortController) { abortController.abort(); abortController = null; }
  toggleSendButton(false);

  var cur = currentSession();
  if (cur && cur.messages.length === 0) {
    closeSidebar();
    renderEmptyState();
    chatInput.focus();
    return;
  }

  createSession();
  closeSidebar();
  renderEmptyState();
  chatInput.focus();
}

// ================================================================
// 暴露到全局（供 HTML 和其他模块调用）
// ================================================================

window.startNewSession = startNewSession;
window.openSidebar = openSidebar;
window.closeSidebar = closeSidebar;
window.renderSidebarList = renderSidebarList;
window.confirmDeleteSession = confirmDeleteSession;
window.sendMessage = sendMessage;
window.toggleAutoPlay = toggleAutoPlay;

// 重新导出 state 到全局
Object.defineProperty(window, 'sessions', {
  get: function() { return sessions; }
});
Object.defineProperty(window, 'currentSessionId', {
  get: function() { return currentSessionId; },
  set: function(val) { currentSessionId = val; }
});
window.switchSession = function(id) {
  currentSessionId = id;
  saveSessions();
};
window.deleteSession = deleteSession;
