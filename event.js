 document.addEventListener("DOMContentLoaded", () => {
  chrome.runtime.sendMessage({ action: "ping" }, (response) => {
    console.log("Response from background:", response);
  });
});