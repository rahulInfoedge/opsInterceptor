// This script runs in the page context to intercept XHR and Fetch requests
(function() {
  'use strict';
  
  console.log('Outlook Task Interceptor: Injected script loaded');
  
  // Store original functions
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  const originalFetch = window.fetch;
  
  // Override XMLHttpRequest
  XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
    this._interceptedData = {
      method: method,
      url: url,
      timestamp: Date.now()
    };
    
    return originalXHROpen.apply(this, arguments);
  };
  
  XMLHttpRequest.prototype.send = function(data) {
    const xhr = this;
    
    // Add event listener for response
    xhr.addEventListener('readystatechange', function() {
      if (xhr.readyState === 4) {
        handleResponse(xhr._interceptedData, xhr.responseText, xhr.status);
      }
    });
    
    if (data) {
      xhr._interceptedData.requestData = data;
    }
    
    return originalXHRSend.apply(this, arguments);
  };
  
  // Override Fetch API
  window.fetch = async function(...args) {
    const startTime = Date.now();
    let url = args[0];
    let options = args[1] || {};
    
    // Handle Request object
    if (typeof url === 'object' && url.url) {
      url = url.url;
    }
    
    const interceptedData = {
      method: options.method || 'GET',
      url: url,
      timestamp: startTime,
      requestData: options.body
    };
    
    try {
      const response = await originalFetch.apply(this, args);
      
      // Clone response to avoid consuming it
      const responseClone = response.clone();
      
      // Try to get response text (handle potential errors)
      try {
        const responseText = await responseClone.text();
        handleResponse(interceptedData, responseText, response.status);
      } catch (e) {
        console.log('Could not read response text:', e);
        handleResponse(interceptedData, '[Binary or unreadable content]', response.status);
      }
      
      return response;
    } catch (error) {
      console.error('Fetch error:', error);
      throw error;
    }
  };
  
  // Function to handle and analyze responses
  function handleResponse(requestData, responseText, statusCode) {
    if (!isRelevantOutlookRequest(requestData.url)) {
      return;
    }
    
    console.log('Intercepted Response:', {
      url: requestData.url,
      method: requestData.method,
      status: statusCode,
      timestamp: requestData.timestamp
    });
    
    // Try to parse JSON response
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(responseText);
    } catch (e) {
      parsedResponse = responseText;
    }
    
    // Look for email content in response
    const emailContent = extractEmailContent(parsedResponse);
    if (emailContent) {
      // Dispatch event to content script
      window.dispatchEvent(new CustomEvent('emailContentDetected', {
        detail: {
          content: emailContent,
          source: 'network_response',
          url: requestData.url,
          timestamp: Date.now()
        }
      }));
    }
    
    // Send network data to content script
    window.dispatchEvent(new CustomEvent('networkDataIntercepted', {
      detail: {
        request: requestData,
        response: {
          status: statusCode,
          data: parsedResponse,
          text: responseText.substring(0, 1000) // Limit length for logging
        }
      }
    }));
  }
  
  // Function to check if request is relevant
  function isRelevantOutlookRequest(url) {
    const relevantPatterns = [
      '/api/v2.0/me/messages',
      '/api/beta/me/messages',
      '/api/v1.0/me/messages',
      '/owa/service.svc',
      '/api/v2.0/me/mailfolders',
      '/mail/api/',
      '/api/mail/',
      'GetItem',
      'GetConversation',
      'FindItem',
      'FindConversation',
      'action=FindConversation',
      'action=GetConversation',
      'action=GetItem',
      'ReadItem',
      'SyncFolderItems'
    ];
    
    // Log all requests for debugging
    console.log('🔍 Checking injected URL:', url);
    
    const isRelevant = relevantPatterns.some(pattern => url.includes(pattern));
    if (isRelevant) {
      console.log('✅ Relevant injected request:', url);
    }
    
    return isRelevant;
  }
  
  // Function to extract email content from API responses
  function extractEmailContent(response) {
    if (!response || typeof response !== 'object') {
      return null;
    }
    
    let emailContent = '';
    
    // Handle different response structures
    if (response.Body && response.Body.Content) {
      emailContent = response.Body.Content;
    } else if (response.body && response.body.content) {
      emailContent = response.body.content;
    } else if (response.value && Array.isArray(response.value)) {
      // Handle array of messages
      response.value.forEach(item => {
        if (item.body && item.body.content) {
          emailContent += item.body.content + '\n\n';
        } else if (item.Body && item.Body.Content) {
          emailContent += item.Body.Content + '\n\n';
        }
      });
    } else if (response.ResponseMessages && response.ResponseMessages.Items) {
      // Handle EWS responses
      response.ResponseMessages.Items.forEach(item => {
        if (item.Items && item.Items.length > 0) {
          item.Items.forEach(mailItem => {
            if (mailItem.Body && mailItem.Body.Value) {
              emailContent += mailItem.Body.Value + '\n\n';
            }
          });
        }
      });
    }
    
    // Clean HTML tags if present
    if (emailContent.includes('<')) {
      const div = document.createElement('div');
      div.innerHTML = emailContent;
      emailContent = div.textContent || div.innerText || '';
    }
    
    return emailContent.trim().length > 50 ? emailContent.trim() : null;
  }
  
})();