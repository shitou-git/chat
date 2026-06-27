// 模拟浏览器环境
global.window = {};
global.document = {
  getElementById: () => ({ 
    addEventListener: () => {}, 
    classList: { add: () => {}, remove: () => {} },
    querySelector: () => null,
    querySelectorAll: () => [],
    appendChild: () => {},
    insertBefore: () => {},
    style: {},
    value: '',
    checked: false,
    innerHTML: '',
    textContent: '',
    focus: () => {},
    setAttribute: () => {},
  }),
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ 
    classList: { add: () => {}, remove: () => {} }, 
    addEventListener: () => {},
    style: {},
    appendChild: () => {},
    setAttribute: () => {},
    querySelector: () => null,
    innerHTML: '',
    textContent: '',
  }),
  documentElement: { classList: { add: () => {}, remove: () => {} } },
  body: { appendChild: () => {} },
};
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
global.speechSynthesis = {
  getVoices: () => [],
  speak: () => {},
  cancel: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  pause: () => {},
  resume: () => {},
};
global.matchMedia = () => ({ matches: false, addEventListener: () => {} });

console.log("Testing app.js...");
try {
  await import('./js/app.js');
  console.log("App loaded successfully");
} catch (e) {
  console.error("Error loading app.js:", e.message);
  console.error(e.stack);
}
