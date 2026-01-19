document.getElementById('scanBtn').addEventListener('click', async () => {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = 'Starting scan...';
  
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab) {
      statusDiv.textContent = 'Error: No active tab found.';
      return;
  }

  // Send message to content script
  try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'scanImages' });
      console.log('Scan started', response);
  } catch (err) {
      console.error(err);
      // If content script is not ready, we might need to reload or inject it? 
      // Manifest v3 usually injects automatically.
      statusDiv.textContent = 'Error: Please refresh the page and try again.';
  }
});

// Listen for status updates from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateStatus') {
      document.getElementById('status').textContent = message.status;
  }
});
