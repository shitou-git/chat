/**
 * 应用入口模块
 * 包含初始化、事件绑定、主题切换等
 */
 
import { CONFIG } from './config.js?v=59';
import {
  state,
  loadSessions,
  createSession,
  saveSessions,
  deleteSession,
  removeMessageData,
  saveChatHistory,
  chatData,
  currentSession,
  clearAllLocalSessions,
  loadAllFromServer,
  clearCurrentSessionMessages,
  refreshFromServer,
  ensureEmptySession
} from './state.js?v=59';
import {
  getDOMElements,
  domRefs as renderRefs,
  renderCurrentSession,
  renderEmptyState,
  hideMsgActionMenu,
  currentActionMenu,
  hideConfirm,
  openSidebar,
  closeSidebar,
  confirmDeleteSession,
  renderSidebarList
} from './render.js?v=59';
import {
  sendMessage,
  toggleSendButton,
  stopGeneration
} from './chat.js?v=59';
import {
  initVoices,
  initStreamTTS,
  updateHeaderPlayBtn,
  stopAllSpeak,
  pauseStreamTTS,
  resumeStreamTTS,
  getStreamTTSState
} from './tts.js?v=59';
import {
  register,
  login,
  logout,
  fetchMe,
  isLoggedIn,
  currentUser
} from './auth.js?v=59';
 
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
  if (dom.chatSidebarRefreshBtn) {
    dom.chatSidebarRefreshBtn.addEventListener("click", function() {
      refreshFromServer().then(function() {
        renderSidebarList();
        renderCurrentSession();
      });
    });
  }
 
  // 主题切换
  if (dom.chatThemeBtn) dom.chatThemeBtn.addEventListener("click", toggleTheme);

  // 语音播报播放/暂停
  if (dom.chatAutoPlayBtn) dom.chatAutoPlayBtn.addEventListener("click", togglePlayPause);
 
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
    if (state.abortController) state.abortController.abort();
  });
 
  // 重新回答事件
  document.addEventListener('chat:regenerate', function (e) {
    if (e.detail && e.detail.question) {
      renderRefs.chatInput.value = e.detail.question;
    }
    sendMessage();
  });
 
  // 认证相关
  setupAuth();
 
  // 初始化会话
  loadSessions();
  initVoices();
  initStreamTTS();
  updateHeaderPlayBtn();

  // 确保始终有一个空话题
  ensureEmptySession();
  if (!state.currentSessionId) {
    state.currentSessionId = state.sessions[0].id;
  }
  renderCurrentSession();
  dom.chatInput.focus();
 
  // 初始化主题
  initTheme();

  // 多标签页数据同步（第五条）
  setupMultiTabSync();
}
 
// ================================================================
// 多标签页数据同步（storage事件 + visibilitychange事件）
// ================================================================
 
var _syncThrottleTimer = null;
var _lastServerRefresh = 0;
var SERVER_REFRESH_INTERVAL = 200000;
 
function setupMultiTabSync() {
  // 1) 监听 storage 事件：其他标签页修改 localStorage 时触发
  //    只同步本地状态变更（如删除消息），不从服务端拉取
  window.addEventListener('storage', function (e) {
    if (!e.key) return;
    console.log('[灵知] storage事件 - key:', e.key);
 
    
    if (e.key === CONFIG.STORAGE_KEY || e.key === CONFIG.STORAGE_KEY + '_deleted') {
     
      if (_syncThrottleTimer) return;
      _syncThrottleTimer = setTimeout(function () {
        _syncThrottleTimer = null;
      
        console.log('[灵知] 检测到其他标签页数据变更，同步本地状态');
        loadSessions();
        renderSidebarList();
        renderCurrentSession();
   
      }, 800);
    }
  });
 
  // 2) 监听 visibilitychange 事件：页面从后台切换回前台时刷新服务端数据
  //    节流：至少间隔30秒才刷新一次，避免频繁抖动
  document.addEventListener('visibilitychange', function () {
  
    if (document.hidden) return;
    if (!isLoggedIn()) return;
 
    var now = Date.now();
    if (now - _lastServerRefresh < SERVER_REFRESH_INTERVAL) {
      console.log('[灵知] 页面重新可见，但距离上次刷新不足2分钟，跳过');
      return;
    }
    console.log('[灵知] 页面重新可见，从服务端刷新数据');
    _lastServerRefresh = now;
    setTimeout(function () {
      refreshFromServer().then(function () {
        renderSidebarList();
        renderCurrentSession();
      });
    }, 500);
  });
}
 
// ================================================================
// 输入框高度自适应
// ================================================================
 
var _inputResizeRaf = null;
 
function updateInputHeight() {
  if (_inputResizeRaf) return;
  _inputResizeRaf = requestAnimationFrame(function () {
    _inputResizeRaf = null;
    var h = renderRefs.chatInput.scrollHeight;
    if (h > CONFIG.MAX_TEXTAREA_HEIGHT) h = CONFIG.MAX_TEXTAREA_HEIGHT;
    renderRefs.chatInput.style.height = "auto";
    renderRefs.chatInput.style.height = h + "px";
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
// 语音播报播放/暂停
// ================================================================

function togglePlayPause() {
  var streamState = getStreamTTSState();
  if (!streamState) return;
  if (streamState.isPlaying) {
    pauseStreamTTS();
  } else if (streamState.isPaused) {
    resumeStreamTTS();
  }
}

// ================================================================
// 确认弹窗处理
// ================================================================
 
function onConfirmOk() {
  if (!state.pendingOperation) {
    hideConfirm();
    return;
  }
 
  if (state.pendingOperation.type === 'session') {
    var sid = state.pendingOperation.id;
    state.pendingOperation = null;
    hideConfirm();
    // 使用 render.js 中的 deleteSession
    window.deleteSession(sid);
    renderSidebarList();
    renderCurrentSession();
    return;
  }
 
  if (state.pendingOperation.type === 'msg') {
    var id = parseInt(state.pendingOperation.msgDiv.dataset.msgId, 10);
    removeMessageData(id);
    state.pendingOperation.msgDiv.remove();
    state.pendingOperation = null;
    saveChatHistory();
    if (chatData().length === 0) renderEmptyState();
    hideConfirm();
    return;
  }
 
  if (state.pendingOperation.type === 'clearAll') {
    if (state.abortController) { state.abortController.abort(); state.abortController = null; }
    toggleSendButton(false);
    clearCurrentSessionMessages();
    renderEmptyState();
    hideConfirm();
    return;
  }
 
  state.pendingOperation = null;
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
  if (state.abortController) { state.abortController.abort(); state.abortController = null; }
  toggleSendButton(false);
 
  var cur = currentSession();
  if (cur && cur.messages.length === 0) {
    closeSidebar();
    renderEmptyState();
    renderRefs.chatInput.focus();
    return;
  }
 
  createSession();
  closeSidebar();
  renderEmptyState();
  renderRefs.chatInput.focus();
}
 
// ================================================================
// 认证（登录/注册）
// ================================================================
 
var _authMode = 'login';
 
var _userMenu = null;

function setupAuth() {
  var userBtn = document.getElementById('authUserBtn');
  var overlay = document.getElementById('authOverlay');
  var closeBtn = document.getElementById('authCloseBtn');
  var submitBtn = document.getElementById('authSubmitBtn');
  var switchBtn = document.getElementById('authSwitchBtn');
  var nicknameField = document.getElementById('authNicknameField');
  var title = document.getElementById('authTitle');
  var switchText = document.getElementById('authSwitchText');

  _userMenu = document.getElementById('userMenu');

  if (userBtn) {
    userBtn.addEventListener('click', function () {
      if (isLoggedIn()) {
        toggleUserMenu();
      } else {
        openAuthModal('login');
      }
    });
  }

  // 生图按钮
  var imageGenBtn = document.getElementById('userMenuImageGen');
  if (imageGenBtn) {
    imageGenBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      hideUserMenu();
      window.open('https://shitou-git.github.io/Image/st', '_blank');
    });
  }

  // 退出按钮
  var logoutBtn = document.getElementById('userMenuLogout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      hideUserMenu();
      if (confirm('确定要退出登录吗？退出后本地聊天记录将被清除。')) {
        logout();
      }
    });
  }

  // 点击其他地方关闭菜单
  document.addEventListener('click', function (e) {
    if (_userMenu && !_userMenu.contains(e.target)) {
      var userBtn = document.getElementById('authUserBtn');
      if (!userBtn || !userBtn.contains(e.target)) {
        hideUserMenu();
      }
    }
  });
 
  if (closeBtn) {
    closeBtn.addEventListener('click', closeAuthModal);
  }
  if (overlay) {
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeAuthModal();
    });
  }
 
  if (switchBtn) {
    switchBtn.addEventListener('click', function () {
      if (_authMode === 'login') {
        openAuthModal('register');
      } else {
        openAuthModal('login');
      }
    });
  }
 
  if (submitBtn) {
    submitBtn.addEventListener('click', handleAuthSubmit);
  }
 
  ['authEmail', 'authPassword', 'authNickname'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleAuthSubmit();
        }
      });
    }
  });
 
  var _lastLoginState = isLoggedIn();
  console.log('[灵知] setupAuth - 初始登录状态:', _lastLoginState);
  document.addEventListener('auth:changed', function () {
    var nowLoggedIn = isLoggedIn();
    console.log('[灵知] auth:changed - 之前:', _lastLoginState, ', 现在:', nowLoggedIn);
    updateAuthUI();
    if (nowLoggedIn) {
      if (!_lastLoginState) {
        console.log('[灵知] auth:changed - 从登出变为登录，调用 handleLogin');
        handleLogin();
      } else {
        console.log('[灵知] auth:changed - 已是登录状态，跳过 handleLogin');
      }
    } else {
      if (_lastLoginState) {
        console.log('[灵知] auth:changed - 从登录变为登出，调用 handleLogout');
        handleLogout();
      }
    }
    _lastLoginState = nowLoggedIn;
  });
 
  updateAuthUI();
 
  if (isLoggedIn()) {
    console.log('[灵知] setupAuth - 页面加载时已登录，调用 fetchMe 和 handleLogin');
    fetchMe();
    handleLogin();
  }
}
 
function openAuthModal(mode) {
  _authMode = mode || 'login';
  var overlay = document.getElementById('authOverlay');
  var nicknameField = document.getElementById('authNicknameField');
  var title = document.getElementById('authTitle');
  var switchText = document.getElementById('authSwitchText');
  var switchBtn = document.getElementById('authSwitchBtn');
  var submitBtn = document.getElementById('authSubmitBtn');
  var errorEl = document.getElementById('authError');
 
  if (!overlay) return;
 
  if (mode === 'register') {
    title.textContent = '注册账号';
    nicknameField.style.display = 'block';
    switchText.textContent = '已有账号？';
    switchBtn.textContent = '去登录';
    submitBtn.textContent = '注册';
  } else {
    title.textContent = '登录';
    nicknameField.style.display = 'none';
    switchText.textContent = '还没有账号？';
    switchBtn.textContent = '去注册';
    submitBtn.textContent = '登录';
  }
 
  errorEl.textContent = '';
  document.getElementById('authEmail').value = '';
  document.getElementById('authPassword').value = '';
  var nickInput = document.getElementById('authNickname');
  if (nickInput) nickInput.value = '';
 
  overlay.classList.add('show');
  setTimeout(function () {
    document.getElementById('authEmail').focus();
  }, 100);
}
 
function closeAuthModal() {
  var overlay = document.getElementById('authOverlay');
  if (overlay) overlay.classList.remove('show');
}
 
function handleAuthSubmit() {
  var emailEl = document.getElementById('authEmail');
  var passwordEl = document.getElementById('authPassword');
  var nicknameEl = document.getElementById('authNickname');
  var errorEl = document.getElementById('authError');
  var submitBtn = document.getElementById('authSubmitBtn');
 
  var email = emailEl.value.trim();
  var password = passwordEl.value;
  var nickname = nicknameEl ? nicknameEl.value.trim() : '';
 
  if (!email) {
    errorEl.textContent = '请输入邮箱';
    return;
  }
  if (!password) {
    errorEl.textContent = '请输入密码';
    return;
  }
  if (_authMode === 'register' && password.length < 6) {
    errorEl.textContent = '密码至少 6 位';
    return;
  }
 
  submitBtn.disabled = true;
  errorEl.textContent = '';
 
  var action = _authMode === 'register'
    ? register(email, password, nickname)
    : login(email, password);
 
  action.then(function () {
    submitBtn.disabled = false;
    closeAuthModal();
  }).catch(function (err) {
    submitBtn.disabled = false;
    errorEl.textContent = err.message || '操作失败';
  });
}
 
function updateAuthUI() {
  var userNameEl = document.getElementById('authUserName');
  if (!userNameEl) return;

  var user = currentUser();
  if (user) {
    userNameEl.textContent = user.nickname || user.email;
  } else {
    userNameEl.textContent = '未登录';
  }
}

function toggleUserMenu() {
  if (!_userMenu) return;
  _userMenu.classList.toggle('show');
}

function hideUserMenu() {
  if (!_userMenu) return;
  _userMenu.classList.remove('show');
}
 
/** 退出登录后清理：清除本地聊天记录、重置界面 */
function handleLogout() {
  hideUserMenu();

  // 停止生成中内容
  if (state.abortController) {
    state.abortController.abort();
    state.abortController = null;
  }
  toggleSendButton(false);
  stopAllSpeak();
  updateHeaderPlayBtn();
 
  // 清除本地所有会话
  clearAllLocalSessions();
 
  // 创建一个新的空会话
  createSession();
 
  // 直接清空聊天消息 DOM，确保消息被清除（强制刷新）
  var chatMessagesEl = document.getElementById('chatMessages');
  if (chatMessagesEl) {
    chatMessagesEl.innerHTML = '';
    chatMessagesEl.innerHTML = '<div class="chat-empty-tip"><span class="big">👋</span>你好！我是灵知</div>';
  }
 
  // 重新渲染侧边栏
  renderSidebarList();
 
  // 清空输入框
  if (renderRefs.chatInput) {
    renderRefs.chatInput.value = '';
    renderRefs.chatInput.style.height = 'auto';
    renderRefs.chatInput.focus();
  }
 
  // 最后更新用户 UI（这会更新显示"未登录"）
  updateAuthUI();
}
 
/** 登录后处理：从服务端加载历史聊天记录 */
function handleLogin() {
  console.log('[灵知] handleLogin - 开始加载服务端数据...');
  console.log('[灵知] handleLogin - 加载前本地会话数:', state.sessions.length);
  loadAllFromServer().then(function () {
    console.log('[灵知] handleLogin - 服务端数据加载完成，当前会话数:', state.sessions.length);
    // 加载完成后重新渲染
    if (state.sessions.length === 0) {
      console.log('[灵知] handleLogin - 无会话，创建新会话');
      createSession();
    }
    renderCurrentSession();
    renderSidebarList();
    console.log('[灵知] handleLogin - 界面渲染完成');
  }).catch(function(err) {
    console.error('[灵知] handleLogin - 加载服务端数据失败:', err);
    // 即使加载失败，也确保有一个新会话
    if (state.sessions.length === 0) {
      createSession();
    }
    renderCurrentSession();
    renderSidebarList();
  });
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
window.togglePlayPause = togglePlayPause;
 
// 重新导出 state 到全局
Object.defineProperty(window, 'state', {
  get: function() { return state; }
});
Object.defineProperty(window, 'sessions', {
  get: function() { return state.sessions; }
});
Object.defineProperty(window, 'currentSessionId', {
  get: function() { return state.currentSessionId; },
  set: function(val) { state.currentSessionId = val; }
});
window.switchSession = function(id) {
  state.currentSessionId = id;
  saveSessions();
};
window.deleteSession = deleteSession;
 
// ================================================================
// 启动应用
// ================================================================
 
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () {
    try {
      setupChat();
    } catch (e) {
      handleInitError(e);
    }
  });
} else {
  try {
    setupChat();
  } catch (e) {
    handleInitError(e);
  }
}
 
function handleInitError(err) {
  console.error('[灵知] 初始化失败：', err);
  showInitError(err);
}
 
function showInitError(err) {
  var messages = document.getElementById('chatMessages');
  if (!messages) return;
  messages.innerHTML =
    '<div class="chat-empty-tip" style="color:#ef4444;padding:30px 20px;text-align:left;">' +
    '<div style="font-size:1.05rem;font-weight:600;margin-bottom:10px;">⚠️ 初始化失败</div>' +
    '<div style="font-size:0.88rem;color:#6b7280;line-height:1.6;word-break:break-all;">' +
    String((err && err.stack) || err || '未知错误') +
    '</div></div>';
 }
