// 先设置一些浏览器环境的模拟
global.window = {};
global.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ classList: { add: () => {}, remove: () => {} }, addEventListener: () => {} }),
};
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
};
global.speechSynthesis = {
  getVoices: () => [],
  speak: () => {},
  cancel: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
};

import * as tts from './js/tts.js';
console.log("TTS loaded successfully");
console.log("initVoices:", typeof tts.initVoices);
console.log("initStreamTTS:", typeof tts.initStreamTTS);
console.log("stopAllSpeak:", typeof tts.stopAllSpeak);
console.log("speakText:", typeof tts.speakText);
console.log("getStreamTTSState:", typeof tts.getStreamTTSState);
console.log("pauseStreamTTS:", typeof tts.pauseStreamTTS);
console.log("resumeStreamTTS:", typeof tts.resumeStreamTTS);
