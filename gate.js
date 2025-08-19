import { mountUI } from './ui.js';
document.addEventListener('DOMContentLoaded', () => mountUI());
// document.addEventListener("DOMContentLoaded", function () {
//   const debugToggle = document.getElementById("debug-toggle");

//   debugToggle.addEventListener("click", () => {
//     debugToggle.classList.toggle("on");

//     const thumb = debugToggle.querySelector(".thumb");

//     if (debugToggle.classList.contains("on")) {
//       thumb.textContent = "ON";
//       console.log("Debug Mode Enabled");
//       // 👉 Place your debug logic here
//     } else {
//       thumb.textContent = "OFF";
//       console.log("Debug Mode Disabled");
//       // 👉 Place disable debug logic here
//     }
//   });
// });


 document.getElementById("copyBtn").addEventListener("click", function() {
    const textBox = document.getElementById("tokenOut");
    textBox.select();
    textBox.setSelectionRange(0, 99999); // for mobile

    navigator.clipboard.writeText(textBox.value).then(() => {
      document.getElementById("copyStatus").textContent = "Copied!";
      setTimeout(() => {
        document.getElementById("copyStatus").textContent = "";
      }, 2000);
    });
  });