console.log("Testing state.js directly...");
try {
  const mod = await import('./js/state.js');
  console.log("state.js loaded successfully");
  console.log("Keys:", Object.keys(mod).slice(0, 10));
} catch (e) {
  console.error("Error:", e.message);
  console.error("Stack:", e.stack);
}
