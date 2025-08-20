// Early interceptor that runs immediately to catch all network requests
(function() {
  'use strict';
  
  console.log('⚡ Early interceptor loaded');
  
  // Store original functions IMMEDIATELY
  const originalXHR = XMLHttpRequest;
  const originalFetch = window.fetch;
  
  // Track all requests from the very beginning
  window.earlyRequests = [];
  
  // Override XMLHttpRequest constructor
  window.XMLHttpRequest = function() {
    const xhr = new originalXHR();
    const originalOpen = xhr.open;
    const originalSend = xhr.send;
    
    xhr.open = function(method, url, ...args) {
      console.log('🌐 EARLY XHR:', method, url);
      
      if (url.includes('service.svc') || url.includes('FindConversation')) {
        console.log('🎯 EARLY CAPTURE:', url);
        window.earlyRequests.push({
          type: 'xhr',
          method: method,
          url: url,
          timestamp: Date.now()
        });
      }
      
      // Store URL for later use
      this._interceptUrl = url;
      this._interceptMethod = method;
      
      return originalOpen.call(this, method, url, ...args);
    };
    
    xhr.send = function(data) {
      const url = this._interceptUrl || 'unknown';
      const method = this._interceptMethod || 'unknown';
      
      this.addEventListener('readystatechange', function() {
        if (this.readyState === 4 && (url.includes('service.svc') || url.includes('FindConversation'))) {
          console.log('🎯 EARLY XHR RESPONSE:', url, this.status);
          console.log('Response preview:', this.responseText.substring(0, 300));
          
          // Dispatch custom event with response data
          window.dispatchEvent(new CustomEvent('earlyNetworkCapture', {
            detail: {
              url: url,
              method: method,
              response: this.responseText,
              status: this.status,
              timestamp: Date.now()
            }
          }));
        }
      });
      
      return originalSend.call(this, data);
    };
    
    return xhr;
  };
  
  // Copy static properties to maintain compatibility
  Object.setPrototypeOf(window.XMLHttpRequest, originalXHR);
  Object.setPrototypeOf(window.XMLHttpRequest.prototype, originalXHR.prototype);
  
  // Override Fetch API
  window.fetch = async function(...args) {
    const url = args[0]?.url || args[0];
    const options = args[1] || {};
    
    console.log('🌐 EARLY FETCH:', url);
    
    if (url && (url.includes('service.svc') || url.includes('FindConversation'))) {
      console.log('🎯 EARLY FETCH CAPTURE:', url);
      window.earlyRequests.push({
        type: 'fetch',
        url: url,
        timestamp: Date.now()
      });
    }
    
    try {
      const response = await originalFetch.apply(this, args);
      
      if (url && (url.includes('service.svc') || url.includes('FindConversation'))) {
        console.log('🎯 EARLY FETCH RESPONSE:', url, response.status);
        
        // Clone response to avoid consuming it
        const responseClone = response.clone();
        responseClone.text().then(text => {
          console.log('Response preview:', text.substring(0, 300));
          
          window.dispatchEvent(new CustomEvent('earlyNetworkCapture', {
            detail: {
              url: url,
              method: options.method || 'GET',
              response: text,
              status: response.status,
              timestamp: Date.now()
            }
          }));
        }).catch(e => {
          console.log('Could not read fetch response text:', e);
          
          // Still dispatch event with basic info
          window.dispatchEvent(new CustomEvent('earlyNetworkCapture', {
            detail: {
              url: url,
              method: options.method || 'GET',
              response: '[Could not read response]',
              status: response.status,
              timestamp: Date.now()
            }
          }));
        });
      }
      
      return response;
    } catch (error) {
      console.error('Early fetch error:', error);
      throw error;
    }
  };
  
  // Also try to intercept any existing fetch/xhr calls that might be queued
  setTimeout(() => {
    console.log('📊 Early requests captured so far:', window.earlyRequests.length);
    window.earlyRequests.forEach(req => {
      console.log('  -', req.type.toUpperCase(), req.url);
    });
  }, 1000);
  
  console.log('⚡ Early network interception active');
})();