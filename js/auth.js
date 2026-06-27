

import { CONFIG } from './config.js?v=56';
 
var _currentUser = null;
var _token = null;
 
function getToken() {
  if (_token) return _token;
  try {
    _token = localStorage.getItem(CONFIG.TOKEN_KEY) || null;
  } catch (e) { _token = null; }
  return _token;
}
 
function setToken(token) {
  _token = token;
  try {
    if (token) {
      localStorage.setItem(CONFIG.TOKEN_KEY, token);
    } else {
      localStorage.removeItem(CONFIG.TOKEN_KEY);
    }
  } catch (e) {}
}
 
function getCurrentUser() {
  if (_currentUser) return _currentUser;
  try {
    var data = localStorage.getItem(CONFIG.USER_KEY);
    _currentUser = data ? JSON.parse(data) : null;
  } catch (e) { _currentUser = null; }
  return _currentUser;
}
 
function setCurrentUser(user) {
  _currentUser = user;
  try {
    if (user) {
      localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(CONFIG.USER_KEY);
    }
  } catch (e) {}
}
 
function authHeaders() {
  var token = getToken();
  var headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = 'Bearer ' + token;
  }
  return headers;
}
 
async function apiRequest(path, options) {
  var url = CONFIG.API_BASE_URL + path;
  var opts = options || {};
  var headers = authHeaders();
  if (opts.headers) {
    Object.assign(headers, opts.headers);
  }
  opts.headers = headers;
 
  console.log('[灵知] apiRequest -', opts.method || 'GET', url);
 
  var response = await fetch(url, opts);
  var data = null;
  try { data = await response.json(); } catch (e) { data = { error: '解析响应失败' }; }
 
  console.log('[灵知] apiRequest - 响应状态:', response.status, ', 数据:', data);
 
  if (!response.ok) {
    console.error('[灵知] apiRequest - 失败:', (data && data.error) || response.status);
    throw new Error((data && data.error) || ('请求失败：' + response.status));
  }
  return data;
}
 
export async function register(email, password, nickname) {
  var data = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, nickname })
  });
  setToken(data.token);
  setCurrentUser(data.user);
  clearGuestMessageCount();
  document.dispatchEvent(new CustomEvent('auth:changed', { detail: { user: data.user } }));
  return data.user;
}
 
export async function login(email, password) {
  console.log('[灵知] login - 开始登录');
  var data = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  setToken(data.token);
  setCurrentUser(data.user);
  clearGuestMessageCount();
  console.log('[灵知] login - 登录成功，触发 auth:changed 事件');
  document.dispatchEvent(new CustomEvent('auth:changed', { detail: { user: data.user } }));
  return data.user;
}
 
export async function logout() {
  console.log('[灵知] logout - 开始退出登录');
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
  } catch (e) {
    console.warn('[灵知] logout - 后端登出失败:', e);
  }
  setToken(null);
  setCurrentUser(null);
  console.log('[灵知] logout - 触发 auth:changed 事件');
  document.dispatchEvent(new CustomEvent('auth:changed', { detail: { user: null } }));
}
 
export async function fetchMe() {
  try {
    console.log('[灵知] fetchMe - 开始获取用户信息');
    var data = await apiRequest('/api/auth/me', { method: 'GET' });
    console.log('[灵知] fetchMe - 成功:', data);
    setCurrentUser(data);
    document.dispatchEvent(new CustomEvent('auth:changed', { detail: { user: data } }));
    return data;
  } catch (e) {
    console.warn('[灵知] fetchMe - 失败:', e);
    // fetchMe 失败不清除 token，避免意外登出
    // 只在明确调用 logout 时才清除 token
    return null;
  }
}
 
export function isLoggedIn() {
  return !!getToken();
}
 
export function authToken() {
  return getToken();
}
 
export function currentUser() {
  return getCurrentUser();
}
 
function clearGuestMessageCount() {
  try {
    localStorage.removeItem(CONFIG.GUEST_MSG_KEY);
  } catch (e) {}
}
 
export { apiRequest };
 
// ================================================================
// 会话和消息 API（需登录）
// ================================================================
 
export async function createSession(title) {
  var data = await apiRequest('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ title: title || '新话题' })
  });
  return data;
}
 
export async function listSessions() {
  var data = await apiRequest('/api/sessions', { method: 'GET' });
  console.log('[灵知] listSessions - 原始返回:', data);
  console.log('[灵知] listSessions - data.sessions:', data.sessions);
  console.log('[灵知] listSessions - 返回会话数:', (data.sessions || []).length);
  return data.sessions || [];
}
 
export async function updateSession(id, title) {
  return apiRequest('/api/sessions/' + id, {
    method: 'PUT',
    body: JSON.stringify({ title: title })
  });
}
 
export async function deleteRemoteSession(id) {
  return apiRequest('/api/sessions/' + id, { method: 'DELETE' });
}
 
export async function listMessages(sessionId) {
  var data = await apiRequest('/api/sessions/' + sessionId + '/messages', { method: 'GET' });
  console.log('[灵知] listMessages - 会话', sessionId, '原始返回:', data);
  console.log('[灵知] listMessages - 会话', sessionId, '消息数:', (data.messages || []).length);
  return data.messages || [];
}
 
export async function saveMessage(sessionId, role, content) {
  var data = await apiRequest('/api/sessions/' + sessionId + '/messages', {
    method: 'POST',
    body: JSON.stringify({ role: role, content: content })
  });
  return data;
}
 
export async function deleteMessage(sessionId, messageId) {
  return apiRequest('/api/sessions/' + sessionId + '/messages/' + messageId, {
    method: 'DELETE'
  });
}
 
export async function saveMessagesBatch(sessionId, messages) {
  var results = [];
  for (var i = 0; i < messages.length; i++) {
    try {
      var r = await saveMessage(sessionId, messages[i].role, messages[i].content);
      results.push(r);
    } catch (e) {
      console.warn('save message error:', e);
    }
  }
  return results;
}
