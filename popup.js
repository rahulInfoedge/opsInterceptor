// Popup script for displaying intercepted requests
document.addEventListener('DOMContentLoaded', function() {
  const refreshBtn = document.getElementById('refresh-btn');
  const clearBtn = document.getElementById('clear-btn');
  const requestsList = document.getElementById('requests-list');
  const totalCount = document.getElementById('total-count');
  const emailCount = document.getElementById('email-count');
  
  // Load requests on popup open
  loadRequests();
  
  // Refresh button click
  refreshBtn.addEventListener('click', function() {
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Loading...';
    loadRequests();
    setTimeout(() => {
      refreshBtn.disabled = false;
      refreshBtn.textContent = 'Refresh';
    }, 1000);
  });
  
  // Clear button click
  clearBtn.addEventListener('click', function() {
    if (confirm('Clear all intercepted requests?')) {
      chrome.runtime.sendMessage({ type: 'CLEAR_REQUESTS' }, function(response) {
        if (response && response.success) {
          loadRequests();
        }
      });
    }
  });
  
  function loadRequests() {
    chrome.runtime.sendMessage({ type: 'GET_INTERCEPTED_REQUESTS' }, function(response) {
      if (response && response.requests) {
        displayRequests(response.requests);
      } else {
        requestsList.innerHTML = '<div class="no-requests">No requests found</div>';
      }
    });
  }
  
  function displayRequests(requests) {
    if (requests.length === 0) {
      requestsList.innerHTML = '<div class="no-requests">No requests intercepted yet</div>';
      totalCount.textContent = '0';
      emailCount.textContent = '0';
      return;
    }
    
    // Update stats
    totalCount.textContent = requests.length;
    const emailRequests = requests.filter(req => 
      req.url.includes('messages') || 
      req.url.includes('mail') ||
      req.url.includes('GetItem') ||
      req.url.includes('GetConversation')
    );
    emailCount.textContent = emailRequests.length;
    
    // Sort requests by timestamp (newest first)
    const sortedRequests = requests.sort((a, b) => b.timestamp - a.timestamp);
    
    let html = '';
    sortedRequests.forEach(request => {
      const time = new Date(request.timestamp).toLocaleTimeString();
      const statusClass = request.statusCode && request.statusCode >= 400 ? 'error' : '';
      
      html += `
        <div class="request-item">
          <div class="request-url">${truncateUrl(request.url)}</div>
          <div>
            <span class="request-method">${request.method}</span>
            ${request.statusCode ? `<span class="request-status ${statusClass}">Status: ${request.statusCode}</span>` : ''}
            <span class="request-time">${time}</span>
          </div>
          ${request.type ? `<div style="font-size: 11px; color: #666;">Type: ${request.type}</div>` : ''}
        </div>
      `;
    });
    
    requestsList.innerHTML = html;
  }
  
  function truncateUrl(url) {
    if (url.length <= 60) return url;
    
    const urlObj = new URL(url);
    let path = urlObj.pathname + urlObj.search;
    
    if (path.length > 40) {
      path = path.substring(0, 37) + '...';
    }
    
    return urlObj.origin + path;
  }
});

// Auto-refresh every 5 seconds if popup is open
setInterval(() => {
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn && !refreshBtn.disabled) {
    chrome.runtime.sendMessage({ type: 'GET_INTERCEPTED_REQUESTS' }, function(response) {
      if (response && response.requests) {
        const totalCount = document.getElementById('total-count');
        const currentCount = parseInt(totalCount.textContent);
        if (response.requests.length !== currentCount) {
          displayRequests(response.requests);
        }
      }
    });
  }
}, 5000);