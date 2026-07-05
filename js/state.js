

/**
 * 状态管理模块
 * 包含会话管理、状态变量、数据操作等
 *
 * 注意：ES Module 的 `var` 导出绑定不可写，
 *       所有可变状态封装在 `state` 对象中，通过属性赋值
 */
 
import { CONFIG } from './config.js?v=1.2.8';
import { isLoggedIn, saveMessage, deleteMessage, createSession as apiCreateSession, listSessions as apiListSessions, listMessages, deleteRemoteSession } from './auth.js?v=1.2.8';
 
// ================================================================
// 状态对象（可读写）
// ================================================================
 
export var state = {
  /** 多会话数据结构：sessions = [{ id, title, createdAt, messages: [{ id, role, content, serverMsgId }] }] */
  sessions: [],
  currentSessionId: null,
  nextId: 1,
  isGenerating: false,
  abortController: null,
 
  /** pendingOperation: { type: 'msg' | 'session' | 'clearAll', ... } */
  pendingOperation: null,
  scrollRafId: null,

  /** 已删除的会话 ID 集合（服务端会话ID，用于过滤服务端数据） */
  deletedSessionIds: new Set(),
 
  /** 已删除的消息 ID 集合（服务端消息ID，用于过滤服务端数据） */
  deletedMessageIds: new Set(),
};
 
// ================================================================
// 会话管理函数
// ================================================================
 
/** 获取当前会话 */
export function currentSession() {
  return state.sessions.find(function (s) { return s.id === state.currentSessionId; });
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
  var msg = { id: state.nextId++, role: role, content: content };
  s.messages.push(msg);
  // 第一条用户消息自动设为会话标题
  if (s.title === "新话题" && role === "user") {
    s.title = content.substring(0, 20) + (content.length > 20 ? "…" : "");
  }
  // 异步同步到服务端
  var loggedIn = isLoggedIn();
  console.log('[灵知] addMessageData - role:', role, ', loggedIn:', loggedIn, ', serverSessionId:', s.serverSessionId);
  if (loggedIn) {
    if (!s.serverSessionId) {
      console.log('[灵知] addMessageData - 会话未同步，开始同步');
      ensureSessionSynced(s);
    } else {
      console.log('[灵知] addMessageData - 会话已同步，同步消息');
      syncMessageToServer(s, msg);
    }
  }
  return msg;
}
 
/** 同步单条消息到服务端 */
function syncMessageToServer(s, msg) {
  if (!s.serverSessionId) {
    console.warn('[灵知] syncMessageToServer - 无serverSessionId，跳过同步');
    return;
  }
  if (msg.serverMsgId) {
    console.log('[灵知] syncMessageToServer - 消息已同步，跳过');
    return;
  }
  console.log('[灵知] syncMessageToServer - 开始同步消息，sessionId:', s.serverSessionId);
  saveMessage(s.serverSessionId, msg.role, msg.content).then(function (data) {
    if (data && data.id) {
      msg.serverMsgId = data.id;
      console.log('[灵知] syncMessageToServer - 同步成功，serverMsgId:', data.id);
      saveSessions();
    } else {
      console.warn('[灵知] syncMessageToServer - 同步失败，返回数据:', data);
    }
  }).catch(function (e) {
    console.warn('[灵知] syncMessageToServer error:', e);
  });
}
 
/** 从当前会话删除消息 */
export function removeMessageData(id) {
  var s = currentSession();
  if (!s) return;
  var msg = s.messages.find(function (m) { return m.id === id; });
  if (!msg) return;
 
  var serverMsgId = msg.serverMsgId || null;
  var serverSessionId = s.serverSessionId || null;
 
  console.log('[灵知] removeMessageData - 本地消息ID:', id, ', serverMsgId:', serverMsgId, ', serverSessionId:', serverSessionId);
 
  // 先记录已删除的消息ID（即使还没同步到后端，也要防止刷新后又从服务端拉回来）
  if (serverMsgId) {
    state.deletedMessageIds.add(serverMsgId);
    saveDeletedIds();
  }
 
  // 先删除本地消息（乐观更新）
  s.messages = s.messages.filter(function (m) { return m.id !== id; });
  saveSessions();
 
  // 异步同步删除服务端消息
  if (serverSessionId && serverMsgId) {
    console.log('[灵知] removeMessageData - 开始同步删除服务端消息');
    syncDeleteMessage(serverSessionId, serverMsgId).then(function(ok) {
      if (ok) {
        console.log('[灵知] removeMessageData - 服务端消息删除成功');
      } else {
        console.warn('[灵知] removeMessageData - 服务端消息删除失败');
      }
    });
  } else {
    console.log('[灵知] removeMessageData - 跳过服务端删除（无serverMsgId或serverSessionId）');
  }
}
 
/** 清空当前会话的所有消息 */
export function clearCurrentSessionMessages() {
  var s = currentSession();
  if (!s) return;
  var serverSessionId = s.serverSessionId;
  var serverMsgIds = s.messages
    .filter(function (m) { return m.serverMsgId; })
    .map(function (m) { return m.serverMsgId; });
 
  // 记录所有已删除的消息ID
  serverMsgIds.forEach(function (mid) {
    state.deletedMessageIds.add(mid);
  });
  saveDeletedIds();
 
  s.messages = [];
  s.title = "新话题";
  saveSessions();
 
  // 同步删除服务端消息
  if (serverSessionId && serverMsgIds.length > 0) {
    syncClearSessionMessages(serverSessionId, serverMsgIds);
  }
}
 
/** 从指定消息ID开始截断（删除该消息及其之后的所有消息） */
export function truncateMessagesFrom(msgId) {
  var s = currentSession();
  if (!s) return;
  var idx = -1;
  for (var i = 0; i < s.messages.length; i++) {
    if (s.messages[i].id === msgId) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return;
  var serverSessionId = s.serverSessionId;
  var serverMsgIds = s.messages
    .slice(idx)
    .filter(function (m) { return m.serverMsgId; })
    .map(function (m) { return m.serverMsgId; });
 
  // 记录所有已删除的消息ID
  serverMsgIds.forEach(function (mid) {
    state.deletedMessageIds.add(mid);
  });
  saveDeletedIds();
 
  s.messages = s.messages.slice(0, idx);
  saveSessions();
 
  // 同步删除服务端消息
  if (serverSessionId && serverMsgIds.length > 0) {
    syncClearSessionMessages(serverSessionId, serverMsgIds);
  }
}

/** 检查是否存在空话题（没有消息的会话） */
function hasEmptySession() {
  return state.sessions.some(function (s) { return s.messages && s.messages.length === 0; });
}

/** 确保存在一个空话题（没有则创建）
 *  关键：空话题放在列表最前面，首次打开时（currentSessionId 为 null）
 *  默认选中 sessions[0] 即空话题；已选中其他话题时不受影响（savedCurrentId 恢复） */
export function ensureEmptySession() {
  if (!hasEmptySession()) {
    // 保存当前的会话ID，创建空话题后再恢复
    var savedCurrentId = state.currentSessionId;

    var s = {
      id: Date.now() + Math.random().toString(36).slice(2, 7),
      title: "新话题",
      createdAt: Date.now(),
      messages: [],
    };
    // 放在最前面，首次打开时默认选中空话题
    state.sessions.unshift(s);

    // 恢复当前的会话选择（若已有选中话题则不变；首次打开为 null 时由 init 选中 sessions[0]）
    state.currentSessionId = savedCurrentId;
    saveSessions();
  }
}

/** 获取第一个空话题 */
function getFirstEmptySession() {
  return state.sessions.find(function (s) { return s.messages && s.messages.length === 0; });
}

/** 创建新会话 */
export function createSession() {
  var s = {
    id: Date.now() + Math.random().toString(36).slice(2, 7),
    title: "新话题",
    createdAt: Date.now(),
    messages: [],
  };
  state.sessions.unshift(s);
  state.currentSessionId = s.id;
  saveSessions();
  return s;
}
 
/** 切换到指定会话 */
export function switchSession(id) {
  state.currentSessionId = id;
  saveSessions();
}
 
/** 删除会话 */
export function deleteSession(id) {
  // 如果正在生成且删的是当前会话，先中止
  if (id === state.currentSessionId && state.abortController) {
    state.abortController.abort();
    state.abortController = null;
  }
 
  // 先获取服务端会话ID（在删除本地数据之前）
  var s = state.sessions.find(function (sess) { return sess.id === id; });
  var serverSessionId = s && s.serverSessionId ? s.serverSessionId : null;
 
  // 记录已删除的会话 ID（用于过滤服务端数据）
  if (serverSessionId) {
    state.deletedSessionIds.add(serverSessionId);
    // 同时记录该会话下所有消息为已删除
    if (s && s.messages) {
      s.messages.forEach(function (m) {
        if (m.serverMsgId) {
          state.deletedMessageIds.add(m.serverMsgId);
        }
      });
    }
    saveDeletedIds();
  }
 
  state.sessions = state.sessions.filter(function (s) { return s.id !== id; });

  // 删除后：优先切换到已有的空话题，没有则创建新空话题
  if (state.currentSessionId === id || state.sessions.length === 0) {
    // 优先找已有的空话题
    var emptySession = getFirstEmptySession();
    if (emptySession) {
      state.currentSessionId = emptySession.id;
    } else {
      createSession();
    }
    saveSessions();
  } else {
    saveSessions();
  }
 
  // 异步同步删除服务端会话
  if (serverSessionId) {
    syncDeleteSessionByServerId(serverSessionId);
  }
}
 
// ================================================================
// 持久化
// ================================================================
 
/** 持久化所有会话 */
export function saveSessions() {
  try {
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state.sessions));
  } catch (e) {
    console.warn("saveSessions error:", e);
  }
}
 
/** 保存已删除的 ID 列表（会话和消息） */
function saveDeletedIds() {
  try {
    var data = {
      sessions: [...state.deletedSessionIds],
      messages: [...state.deletedMessageIds],
    };
    localStorage.setItem(CONFIG.STORAGE_KEY + '_deleted', JSON.stringify(data));
  } catch (e) {
    console.warn("saveDeletedIds error:", e);
  }
}
 
/** 加载已删除的 ID 列表 */
function loadDeletedIds() {
  try {
    var raw = localStorage.getItem(CONFIG.STORAGE_KEY + '_deleted');
    if (!raw) return;
    var data = JSON.parse(raw);
    if (data && Array.isArray(data.sessions)) {
      state.deletedSessionIds = new Set(data.sessions);
    }
    if (data && Array.isArray(data.messages)) {
      state.deletedMessageIds = new Set(data.messages);
    }
    console.log('[灵知] loadDeletedIds - 已删除会话数:', state.deletedSessionIds.size, ', 已删除消息数:', state.deletedMessageIds.size);
  } catch (e) {
    console.warn("loadDeletedIds error:", e);
  }
}
 
/** 清除所有本地会话（退出登录时调用） */
export function clearAllLocalSessions() {
  state.sessions = [];
  state.currentSessionId = null;
  state.nextId = 1;
  state.deletedSessionIds = new Set();
  state.deletedMessageIds = new Set();
  try {
    localStorage.removeItem(CONFIG.STORAGE_KEY);
    localStorage.removeItem(CONFIG.STORAGE_KEY + '_deleted');
  } catch (e) {
    console.warn("clearAllLocalSessions error:", e);
  }
}
 
/** 从 localStorage 加载所有会话 */
export function loadSessions() {
  try {
    var raw = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (!raw) return;
    var parsed = JSON.parse(raw);

    // 兼容新旧数据格式：
    // - 数组格式：直接是会话数组 [...sessions]
    // - 对象格式：{ sessions: [...], currentSessionId: "xxx" }
    var sessionsArray = null;
    if (Array.isArray(parsed)) {
      sessionsArray = parsed;
    } else if (parsed && Array.isArray(parsed.sessions)) {
      sessionsArray = parsed.sessions;
    }

    if (sessionsArray) {
      // 数据校验：过滤掉结构不完整的会话
      state.sessions = sessionsArray.filter(function (s) {
        return s && typeof s.id !== "undefined" && Array.isArray(s.messages);
      }).map(function (s) {
        if (typeof s.title !== "string") s.title = "新话题";
        if (typeof s.createdAt !== "number") s.createdAt = Date.now();
        return s;
      });
      // 恢复 nextId
      var maxId = 0;
      state.sessions.forEach(function (s) {
        s.messages.forEach(function (m) {
          if (typeof m.id === "number" && m.id > maxId) maxId = m.id;
        });
      });
      state.nextId = maxId + 1;

      // 注意：不恢复 currentSessionId
      // 每次打开页面默认选中空话题（由 init 中的 sessions[0] 逻辑处理）
    }
    // 同时加载删除记录
    loadDeletedIds();
    // 确保始终有一个空话题
    ensureEmptySession();
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
 
/** 同步到服务端（如果已登录） */
export function syncToServer() {
  if (!isLoggedIn()) return;
  var s = currentSession();
  if (!s || !s.serverSessionId) return;
  var lastMsg = s.messages[s.messages.length - 1];
  if (!lastMsg) return;
  saveMessage(s.serverSessionId, lastMsg.role, lastMsg.content).catch(function (e) {
    console.warn('syncToServer error:', e);
  });
}
 
/** 同步新会话到服务端 */
export async function syncNewSession(s) {
  if (!isLoggedIn()) return;
  if (s.serverSessionId) return;
  try {
    var data = await apiCreateSession(s.title);
    s.serverSessionId = data.id;
    saveSessions();
    // 批量同步已有消息
    if (s.messages.length > 0) {
      for (var i = 0; i < s.messages.length; i++) {
        if (!s.messages[i].serverMsgId) {
          var result = await saveMessage(s.serverSessionId, s.messages[i].role, s.messages[i].content);
          if (result && result.id) {
            s.messages[i].serverMsgId = result.id;
          }
        }
      }
      saveSessions();
    }
  } catch (e) {
    console.warn('syncNewSession error:', e);
    throw e;
  }
}
 
/** 确保会话已同步到服务端（处理并发调用） */
var _syncingSessions = {};
 
function ensureSessionSynced(s) {
  if (!isLoggedIn()) return;
  if (!s) return;
  if (s.serverSessionId) return;
 
  var sid = s.id;
  if (_syncingSessions[sid]) {
    // 已经在同步中了，等待同步完成
    return _syncingSessions[sid];
  }
 
  var promise = syncNewSession(s).finally(function () {
    delete _syncingSessions[sid];
  });
  _syncingSessions[sid] = promise;
  return promise;
}
 
/** 登录后同步所有本地会话和消息到服务端 */
export async function syncAllSessionsOnLogin() {
  if (!isLoggedIn()) return;
  console.log('[灵知] syncAllSessionsOnLogin - 开始同步，会话数:', state.sessions.length);
  var syncedCount = 0;
  for (var i = 0; i < state.sessions.length; i++) {
    var s = state.sessions[i];
    if (!s.serverSessionId) {
      // 没有 serverSessionId 的会话，先创建会话再同步所有消息
      if (s.messages.length > 0) {
        console.log('[灵知] syncAllSessionsOnLogin - 同步新会话:', s.title, ', 消息数:', s.messages.length);
        await ensureSessionSynced(s);
        syncedCount++;
      }
    } else {
      // 已有 serverSessionId 的会话，检查是否有未同步的消息
      var unsyncedMsgs = s.messages.filter(function (m) { return !m.serverMsgId; });
      if (unsyncedMsgs.length > 0) {
        console.log('[灵知] syncAllSessionsOnLogin - 同步会话', s.title, '中的未同步消息数:', unsyncedMsgs.length);
        for (var j = 0; j < unsyncedMsgs.length; j++) {
          var msg = unsyncedMsgs[j];
          try {
            var result = await saveMessage(s.serverSessionId, msg.role, msg.content);
            if (result && result.id) {
              msg.serverMsgId = result.id;
            }
          } catch (e) {
            console.warn('[灵知] syncAllSessionsOnLogin - 同步消息失败:', e);
          }
        }
        saveSessions();
        syncedCount++;
      }
    }
  }
  console.log('[灵知] syncAllSessionsOnLogin - 同步完成，处理了', syncedCount, '个会话');
}
 
/** 从服务端加载会话列表 */
export async function loadRemoteSessions() {
  if (!isLoggedIn()) return [];
  try {
    var sessions = await apiListSessions();
    return sessions;
  } catch (e) {
    console.warn('loadRemoteSessions error:', e);
    return [];
  }
}
 
/** 从服务端加载所有会话和消息（登录后调用）
 *  策略：
 *  - 已同步的会话（有serverSessionId）以服务端为准
 *  - 未同步的会话（没有serverSessionId）保留在本地（用户新建的，后端本来就没有）
 *  步骤：
 *  1. 保存当前会话ID和本地未同步会话
 *  2. 从服务端加载所有已同步会话
 *  3. 合并：未同步会话 + 服务端会话
 *  4. 尝试恢复当前选中的会话
 */
export async function loadAllFromServer() {
  if (!isLoggedIn()) {
    console.log('[灵知] loadAllFromServer - 未登录，跳过加载');
    return;
  }
  try {
    console.log('[灵知] loadAllFromServer - 开始加载...');
    console.log('[灵知] loadAllFromServer - 本地会话数:', state.sessions.length);
 
    // 保存当前会话ID，稍后尝试恢复
    var currentId = state.currentSessionId;
 
    // 保存本地未同步的会话（没有 serverSessionId 的）
    // 这些是用户新建的，后端本来就没有，需要保留
    var localUnsynced = state.sessions.filter(function(s) {
      return !s.serverSessionId;
    });
    console.log('[灵知] loadAllFromServer - 本地未同步会话数:', localUnsynced.length);
 
    // 加载本地已删除的 ID 列表
    loadDeletedIds();
 
    // 从服务端拉取最新数据（已同步的会话）
    console.log('[灵知] loadAllFromServer - 从服务端拉取数据');
    var remoteSessions = await apiListSessions();
    console.log('[灵知] loadAllFromServer - 服务端会话数:', remoteSessions.length);
 
    var loadedSessions = [];
    var maxMsgId = 0;

    // 先计算本地已有消息的最大 ID（用于新增消息时分配 ID）
    for (var li = 0; li < state.sessions.length; li++) {
      var lsm = state.sessions[li].messages || [];
      for (var lj = 0; lj < lsm.length; lj++) {
        if (typeof lsm[lj].id === "number" && lsm[lj].id > maxMsgId) maxMsgId = lsm[lj].id;
      }
    }

    // 先添加本地未同步的会话（没有 serverSessionId 的）
    // 这些是用户新建的，后端本来就没有，需要保留原样（ID 不变）
    for (var i = 0; i < localUnsynced.length; i++) {
      var ls = localUnsynced[i];
      loadedSessions.push(ls);
    }

    // 再添加服务端的会话（已同步的）
    // 关键：按 serverSessionId 与本地会话匹配，匹配到就复用本地 ID 和消息 ID
    //       避免刷新后所有 ID 都变了导致当前会话丢失
    for (var i = 0; i < remoteSessions.length; i++) {
      var rs = remoteSessions[i];

      // 跳过已删除的会话
      if (state.deletedSessionIds.has(rs.id)) {
        console.log('[灵知] loadAllFromServer - 跳过已删除的会话:', rs.id);
        continue;
      }

      try {
        var messages = await listMessages(rs.id);
        console.log('[灵知] loadAllFromServer - 会话', rs.id, '消息数:', messages.length);

        // 过滤掉已删除的消息
        var filteredMessages = messages.filter(function (m) {
          var isDeleted = state.deletedMessageIds.has(m.id);
          if (isDeleted) {
            console.log('[灵知] loadAllFromServer - 过滤已删除消息:', m.id);
          }
          return !isDeleted;
        });

        // 查找本地是否已有相同 serverSessionId 的会话
        var localMatch = null;
        for (var k = 0; k < state.sessions.length; k++) {
          if (state.sessions[k].serverSessionId === rs.id) {
            localMatch = state.sessions[k];
            break;
          }
        }

        // 构建本地消息对象
        //  - 如果本地有匹配，尽量复用本地消息 ID（按 serverMsgId 对应）
        //  - 没有匹配的新消息分配新 ID
        var localMsgIdMap = {};
        if (localMatch && localMatch.messages) {
          for (var mi = 0; mi < localMatch.messages.length; mi++) {
            var lm = localMatch.messages[mi];
            if (lm.serverMsgId) {
              localMsgIdMap[lm.serverMsgId] = lm.id;
            }
          }
        }

        var localMsgs = [];
        for (var fi = 0; fi < filteredMessages.length; fi++) {
          var fm = filteredMessages[fi];
          var msgId;
          if (localMsgIdMap[fm.id]) {
            msgId = localMsgIdMap[fm.id];
          } else {
            maxMsgId++;
            msgId = maxMsgId;
          }
          localMsgs.push({
            id: msgId,
            serverMsgId: fm.id,
            role: fm.role,
            content: fm.content,
          });
        }
        // 更新 maxMsgId 为当前最大值
        for (var mi = 0; mi < localMsgs.length; mi++) {
          if (localMsgs[mi].id > maxMsgId) maxMsgId = localMsgs[mi].id;
        }

        // 会话 ID：本地有匹配就复用本地 ID，没有才生成新的
        var sessionId = localMatch ? localMatch.id : (rs.id + '_local');

        loadedSessions.push({
          id: sessionId,
          serverSessionId: rs.id,
          title: rs.title,
          createdAt: rs.created_at || Date.now(),
          messages: localMsgs,
        });
      } catch (e) {
        console.warn('[灵知] loadAllFromServer - 加载会话消息失败:', rs.id, e);
      }
    }

    console.log('[灵知] loadAllFromServer - 最终加载了', loadedSessions.length, '个会话');

    // 确保始终有一个空话题（无消息的会话）
    // 关键：优先复用已有的空话题 ID，避免每次刷新都生成新的空话题
    var hasEmpty = loadedSessions.some(function(s) {
      return s.messages && s.messages.length === 0;
    });
    if (!hasEmpty) {
      // 找本地现有的空话题（无 serverSessionId 且无消息），复用它的 ID
      var existingEmpty = null;
      for (var ei = 0; ei < state.sessions.length; ei++) {
        var es = state.sessions[ei];
        if (!es.serverSessionId && (!es.messages || es.messages.length === 0)) {
          existingEmpty = es;
          break;
        }
      }
      if (existingEmpty) {
        console.log('[灵知] loadAllFromServer - 复用本地空话题 ID:', existingEmpty.id);
        loadedSessions.unshift({
          id: existingEmpty.id,
          serverSessionId: null,
          title: existingEmpty.title || '新话题',
          createdAt: existingEmpty.createdAt || Date.now(),
          messages: [],
        });
      } else {
        console.log('[灵知] loadAllFromServer - 无空话题，创建一个');
        loadedSessions.unshift({
          id: Date.now() + '_local',
          serverSessionId: null,
          title: '新话题',
          createdAt: Date.now(),
          messages: [],
        });
      }
    }

    state.sessions = loadedSessions;
    state.nextId = maxMsgId + 1;

    // 尝试恢复之前选中的会话
    // 由于现在复用了本地 ID，大多数情况下都能直接匹配到
    var currentExists = state.sessions.some(function(s) { return s.id === currentId; });
    if (currentExists) {
      state.currentSessionId = currentId;
      console.log('[灵知] loadAllFromServer - 恢复当前会话:', currentId);
    } else {
      state.currentSessionId = state.sessions[0].id;
      console.log('[灵知] loadAllFromServer - 当前会话不存在，选中第一个:', state.currentSessionId);
    }

    saveSessions();
    console.log('[灵知] loadAllFromServer - 完成，最终会话数:', state.sessions.length);
  } catch (e) {
    console.warn('[灵知] loadAllFromServer - 错误:', e);
  }
}
 
/** 同步删除会话（通过服务端会话ID） */
async function syncDeleteSessionByServerId(serverSessionId) {
  try {
    var result = await deleteRemoteSession(serverSessionId);
    console.log('[灵知] syncDeleteSessionByServerId 结果:', result, ', sessionId:', serverSessionId);
    // 删除成功后保留删除记录，作为双重保险
    // 防止任何缓存问题导致已删除的会话重新出现
    // 过期的删除记录会在下次从服务端加载数据后自动清理
    return true;
  } catch (e) {
    console.warn('syncDeleteSessionByServerId error:', e);
    return false;
  }
}
 
/** 静默刷新从服务端加载数据
 *  - 用于页面打开/切回前台/手动刷新场景
 *  - 加载后保持当前选中的会话不变（只要该会话还在列表中）
 *  - 不影响用户正在阅读的内容 */
export async function refreshFromServer() {
  console.log('[灵知] refreshFromServer - 静默刷新数据');
  // 保存当前会话ID，刷新后强制恢复
  var currentId = state.currentSessionId;
  // 直接调用 loadAllFromServer，它会以服务端为准重新加载
  await loadAllFromServer();
  // 强制恢复之前的会话选择（只要该会话还在列表中）
  if (currentId && state.sessions.some(function(s) { return s.id === currentId; })) {
    state.currentSessionId = currentId;
    console.log('[灵知] refreshFromServer - 恢复当前会话:', currentId);
  }
  // 通知渲染更新
  saveSessions();
}
 
/** 同步删除单条消息 */
async function syncDeleteMessage(serverSessionId, serverMsgId) {
  try {
    console.log('[灵知] syncDeleteMessage - 开始删除 sessionId:', serverSessionId, ', msgId:', serverMsgId);
    var result = await deleteMessage(serverSessionId, serverMsgId);
    console.log('[灵知] syncDeleteMessage - 返回结果:', result);
    var ok = result && (result.ok || result.success);
    if (ok) {
      console.log('[灵知] syncDeleteMessage - 服务端删除成功，保留删除记录作为双重保险');
      // 删除成功后保留删除记录，作为双重保险
      // 防止任何缓存问题导致已删除的消息重新出现
      // 过期的删除记录会在下次从服务端加载数据后自动清理
    }
    return ok;
  } catch (e) {
    console.warn('syncDeleteMessage error:', e);
    return false;
  }
}
 
/** 同步清空会话的所有消息 */
async function syncClearSessionMessages(serverSessionId, serverMsgIds) {
  try {
    for (var i = 0; i < serverMsgIds.length; i++) {
      await deleteMessage(serverSessionId, serverMsgIds[i]);
      // 删除成功后保留删除记录，作为双重保险
    }
    // saveDeletedIds 已经在调用前执行了（记录删除ID时）
    return true;
  } catch (e) {
    console.warn('syncClearSessionMessages error:', e);
    return false;
  }
}
 
/** 保存当前会话（流式期间防抖） */
export function saveChatHistory(immediate) {
  if (immediate) {
    saveSessions();
  } else {
    scheduleSave();
  }
}
