
import { state, ensureEmptySession, currentSession } from './js/state.js?v=54';
import { getDOMElements, renderCurrentSession, renderSidebarList } from './js/render.js?v=54';
import { initVoices, initStreamTTS, updateHeaderPlayBtn, getStreamTTSState } from './js/tts.js?v=54';
import { sendMessage, toggleSendButton } from './js/chat.js?v=54';
import { login, register, isLoggedIn, currentUser } from './js/auth.js?v=54';

console.log('✅ state.js 加载成功');
console.log('✅ render.js 加载成功');
console.log('✅ tts.js 加载成功');
console.log('✅ chat.js 加载成功');
console.log('✅ auth.js 加载成功');

console.log('\n所有模块加载成功！按钮功能应该正常工作。');
console.log('state.sessions:', state.sessions);
console.log('state.currentSessionId:', state.currentSessionId);

ensureEmptySession();
console.log('\n调用 ensureEmptySession 后:');
console.log('state.sessions.length:', state.sessions.length);
console.log('第一个会话:', state.sessions[0] ? state.sessions[0].title : '无');
