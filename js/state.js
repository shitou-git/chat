/**
 * 状态管理模块
 * 包含会话管理、状态变量、数据操作等
 */

import { CONFIG } from './config.js';

// ================================================================
// 状态变量
// ================================================================

/** 多会话数据结构：sessions = [{ id, title, createdAt, messages: [{ id, role, content }] }] */
export var sessions = [];
export var currentSessionId = null;
export var nextId = 1;
export var isGenerating = false;
export var abortController = null;

/** pendingOperation: { type: 'msg' | 'session' | 'clearAll', ... } */
export var pendingOperation = null;
export var scrollRafId = null;

/** 自动播报 TTS 开关 */
export var autoPlayTTS = false;

/** 自动播报状态是否已初始化 */
export var autoPlayTTSReady = false;

// ================================================================
// 状态 setters
// ================================================================

export function setIsGenerating(val) { isGenerating = val; }
export function setAbortController(val) { abortController = val; }

// ================================================================
// 会话管理函数
// ================================================================

/** 获取当前会话 */
export function currentSession() {
  return sessions.find(function (s) { return s.id === currentSessionId; });
}

/** 获取当前会话的消息数组 */
export function chatData() {
  var s = currentSession();
  return s ? s.messages : [];
}

/** 向当前会话添加消息 */
export function addMessageData(role, content) {
  var s = currentSession();
  if (!s) return { id: -1, role: role, content: content };
  var msg = { id: nextId++, role: role, content: content };
  s.messages.push(msg);
  // 第一条用户消息自动设为会话标题
  if (s.title === "新话题" && role === "user") {
    s.title = content.substring(0, 20) + (content.length > 20 ? "…" : "");
  }
  return msg;
}

/** 从当前会话删除消息 */
export function removeMessageData(id) {
  var s = currentSession();
  if (!s) return;
  s.messages = s.messages.filter(function (m) { return m.id !== id; });
}

/** 创建新会话 */
export function createSession() {
  var s = {
    id: Date.now() + Math.random().toString(36).slice(2, 7),
    title: "新话题",
    createdAt: Date.now(),
    messages: [],
  };
  sessions.unshift(s);
  currentSessionId = s.id;
  saveSessions();
  return s;
}

/** 切换到指定会话 */
export function switchSession(id) {
  currentSessionId = id;
  saveSessions();
}

/** 删除会话 */
export function deleteSession(id) {
  // 如果正在生成且删的是当前会话，先中止
  if (id === currentSessionId && abortController) {
    abortController.abort();
    abortController = null;
  }
  sessions = sessions.filter(function (s) { return s.id !== id; });

  if (currentSessionId === id || sessions.length === 0) {
    // 删除的是当前会话（或全部删完）——创建一个新的空话题
    createSession();
  } else {
    saveSessions();
  }
}

// ================================================================
// 持久化
// ================================================================

/** 持久化所有会话 */
export function saveSessions() {
  try {
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(sessions));
  } catch (e) {
    console.warn("saveSessions error:", e);
  }
}

/** 从 localStorage 加载所有会话 */
export function loadSessions() {
  try {
    var raw = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (!raw) return;
    var parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // 数据校验：过滤掉结构不完整的会话
      sessions = parsed.filter(function (s) {
        return s && typeof s.id !== "undefined" && Array.isArray(s.messages);
      }).map(function (s) {
        if (typeof s.title !== "string") s.title = "新话题";
        if (typeof s.createdAt !== "number") s.createdAt = Date.now();
        return s;
      });
      // 恢复 nextId
      var maxId = 0;
      sessions.forEach(function (s) {
        s.messages.forEach(function (m) {
          if (typeof m.id === "number" && m.id > maxId) maxId = m.id;
        });
      });
      nextId = maxId + 1;
    }
  } catch (e) {
    console.warn("loadSessions error:", e);
  }
}

/** 保存会话防抖定时器 */
var _saveDebounceTimer = null;
var _savePending = false;

/** 防抖保存 */
export function scheduleSave() {
  _savePending = true;
  if (_saveDebounceTimer) return;
  _saveDebounceTimer = setTimeout(function () {
    _saveDebounceTimer = null;
    if (_savePending) {
      _savePending = false;
      saveSessions();
    }
  }, 250);
}

/** 保存当前会话（流式期间防抖） */
export function saveChatHistory(immediate) {
  if (immediate) {
    saveSessions();
  } else {
    scheduleSave();
  }
}
