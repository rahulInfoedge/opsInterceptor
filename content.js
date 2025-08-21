// Content script that runs in Outlook pages - VERY EARLY
console.log('🚀 Outlook Task Interceptor: Content script loaded at document_start');

// Inject early interceptor script immediately
function injectEarlyInterceptor() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('early-interceptor.js');
  script.onload = function() {
    console.log('✅ Early interceptor script loaded');
    this.remove();
  };
  script.onerror = function() {
    console.error('❌ Failed to load early interceptor script');
    this.remove();
  };
  
  (document.head || document.documentElement).appendChild(script);
}

// Inject immediately
injectEarlyInterceptor();

// Listen for early network captures from main thread
window.addEventListener('earlyNetworkCapture', (event) => {
  const data = event.detail;
  console.log('📥 Early network data captured:', data.url, data.status);
  
  // Send to background for analysis
  chrome.runtime.sendMessage({
    type: 'EARLY_NETWORK_DATA',
    data: data
  }).catch(err => {
    console.log('Could not send to background:', err);
  });
});

// Listen for messages from Web Workers
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'WORKER_NETWORK_CAPTURE') {
    const data = event.data.data;
    console.log('📥 Worker network data captured:', data.url, data.status);
    
    // Send to background for analysis (same format as earlyNetworkCapture)
    chrome.runtime.sendMessage({
      type: 'EARLY_NETWORK_DATA',
      data: data
    }).catch(err => {
      console.log('Could not send worker data to background:', err);
    });
  }
});

// Also inject the normal monitoring script
setTimeout(() => {
  const normalScript = document.createElement('script');
  normalScript.src = chrome.runtime.getURL('injected.js');
  normalScript.onload = function() {
    console.log('✅ Normal injected script loaded');
    this.remove();
  };
  (document.head || document.documentElement).appendChild(normalScript);
}, 100);

// Rest of the existing content script code...
console.log('Outlook Task Interceptor: Content script initialized');

// Listen for email content from injected script
window.addEventListener('emailContentDetected', (event) => {
  const emailData = event.detail;
  console.log('Email content detected:', emailData);
  
  // Send to background script for analysis
  chrome.runtime.sendMessage({
    type: 'ANALYZE_EMAIL_CONTENT',
    content: emailData.content
  }, (response) => {
    if (response && response.tasks && response.tasks.length > 0) {
      console.log('Tasks found in email:', response.tasks);
      showTaskNotification(response.tasks);
    }
  });
});

// Listen for intercepted network data from injected script
window.addEventListener('networkDataIntercepted', (event) => {
  const networkData = event.detail;
  console.log('Network data intercepted:', networkData);
});

// Function to show task notification
function showTaskNotification(tasks) {
  // Create a notification element
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #0078d4;
    color: white;
    padding: 15px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    max-width: 350px;
    font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
    font-size: 14px;
  \`;
  
  const taskList = tasks.map(task => \`• \${task.text}\`).join('<br>');
  notification.innerHTML = \`
    <strong>📋 Tasks Found in Email</strong><br>
    <div style="margin-top: 8px; font-size: 13px;">
      \${taskList}
    </div>
    <button onclick="this.parentElement.remove()" style="
      background: rgba(255,255,255,0.2);
      border: none;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      margin-top: 10px;
      cursor: pointer;
      font-size: 12px;
    ">Close</button>
  `;
  
  document.body.appendChild(notification);
  
  // Auto remove after 10 seconds
  setTimeout(() => {
    if (notification.parentElement) {
      notification.remove();
    }
  }, 10000);
}

// Monitor for email content changes
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.type === 'childList') {
      // Look for email content containers
      const emailContainers = document.querySelectorAll('[role="main"] [data-testid="message-body"], .rps_1679, .elementToProof');
      
      emailContainers.forEach(container => {
        if (!container.dataset.analyzed && container.textContent.trim().length > 50) {
          container.dataset.analyzed = 'true';
          
          // Extract and analyze email content
          const emailContent = container.textContent;
          window.dispatchEvent(new CustomEvent('emailContentDetected', {
            detail: {
              content: emailContent,
              timestamp: Date.now()
            }
          }));
        }
      });
    }
  });
});

// Start observing when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  });
} else {
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Also check for existing content periodically
function checkForEmailContent() {
  const emailContainers = document.querySelectorAll('[role="main"] [data-testid="message-body"], .rps_1679, .elementToProof');
  emailContainers.forEach(container => {
    if (!container.dataset.analyzed && container.textContent.trim().length > 50) {
      container.dataset.analyzed = 'true';
      const emailContent = container.textContent;
      window.dispatchEvent(new CustomEvent('emailContentDetected', {
        detail: {
          content: emailContent,
          timestamp: Date.now()
        }
      }));
    }
  });
}

// Check immediately and then periodically
setTimeout(checkForEmailContent, 2000);
setTimeout(checkForEmailContent, 5000);
setTimeout(checkForEmailContent, 10000);