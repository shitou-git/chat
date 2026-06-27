console.log("Testing config.js...");
try {
  await import('./js/config.js');
  console.log("config.js loaded successfully");
} catch (e) {
  console.error("Error:", e.message);
}
