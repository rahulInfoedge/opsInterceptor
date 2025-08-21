// Early interceptor that runs immediately to catch all network requests
(function() {
  'use strict';
  
  console.log('⚡ Early interceptor loaded');
  
  // Store original functions IMMEDIATELY
  const originalXHR = XMLHttpRequest;
  const originalFetch = window.fetch;
  
  // Function to intercept worker communications
  function interceptWorkerCommunication() {
    const originalWorker = window.Worker;
    
    // Override Worker constructor
    window.Worker = function(scriptURL, options) {
      // Create a blob URL with our interceptor code
      const workerBlob = new Blob([`
        // Web Worker interceptor
        (function() {
          const originalWorkerFetch = fetch;
          const originalOpenDB = window.indexedDB.open;
          
          // Intercept fetch
          self.fetch = async function(...args) {
            const url = args[0]?.url || args[0];
            const shouldIntercept = url && (url.includes('service.svc?action=GetItem'));
            
            if (shouldIntercept) {
              console.log('🌐 WORKER FETCH:', url);
              try {
                const response = await originalWorkerFetch.apply(this, args);
                const responseClone = response.clone();
                const text = await responseClone.text();
                
                self.postMessage({
                  type: 'WORKER_NETWORK_CAPTURE',
                  data: {
                    url: url,
                    method: 'GET',
                    response: text,
                    status: response.status,
                    timestamp: Date.now()
                  }
                });
                
                return new Response(new Blob([text]), {
                  status: response.status,
                  statusText: response.statusText,
                  headers: response.headers
                });
              } catch (error) {
                console.error('Worker fetch error:', error);
                throw error;
              }
            }
            return originalWorkerFetch.apply(this, args);
          };
          
          // Intercept IndexedDB
          window.indexedDB.open = function(name, version) {
            console.log('🔍 Intercepting IndexedDB open:', name);
            const request = originalOpenDB.call(indexedDB, name, version);
            
            request.onupgradeneeded = function(event) {
              console.log('🔄 IndexedDB upgrade needed for:', name);
              const db = event.target.result;
              
              // Intercept object store creation to add our proxy
              const originalCreateObjectStore = db.createObjectStore;
              db.createObjectStore = function(name, options) {
                console.log('📦 Creating object store:', name);
                const store = originalCreateObjectStore.call(db, name, options);
                
                // Intercept get method
                const originalGet = store.get;
                store.get = function(key) {
                  console.log('🔑 Intercepting get for store:', name, 'key:', key);
                  const request = originalGet.call(store, key);
                  
                  request.onsuccess = function(event) {
                    console.log('📥 Got data from store:', name, 'key:', key);
                    if (event.target.result) {
                      self.postMessage({
                        type: 'INDEXEDDB_GET_ITEM',
                        data: {
                          store: name,
                          key: key,
                          value: event.target.result,
                          timestamp: Date.now()
                        }
                      });
                    }
                  };
                  
                  return request;
                };
                
                return store;
              };
            };
            
            return request;
          };
        })();
        
        // Original worker code will be executed after this
        importScripts('${scriptURL}');
      `], { type: 'application/javascript' });
      
      const workerBlobUrl = URL.createObjectURL(workerBlob);
      const worker = new originalWorker(workerBlobUrl, options);
      
      // Listen for messages from the worker
      const originalPostMessage = worker.postMessage;
      worker.postMessage = function(...args) {
        return originalPostMessage.apply(this, args);
      };
      
      // Add our own message listener
      const originalOnerror = worker.onerror;
      worker.onerror = function(event) {
        console.error('Worker error:', event);
        if (originalOnerror) {
          return originalOnerror.call(worker, event);
        }
      };
      
      return worker;
    };
  }
  
  // Intercept worker creation
  interceptWorkerCommunication();
  
  // Track all requests from the very beginning
  window.earlyRequests = [];
  
  // Override XMLHttpRequest constructor
  window.XMLHttpRequest = function() {
    const xhr = new originalXHR();
    const originalOpen = xhr.open;
    const originalSend = xhr.send;
    
    xhr.open = function(method, url, ...args) {
      console.log('🌐 EARLY XHR:', method, url);
      
      if (url.includes('service.svc') || url.includes('FindConversation') || (url.includes('service.svc?action=GetItem'))) {
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
        if (this.readyState === 4 && (url.includes('service.svc') || url.includes('FindConversation') || url.includes('service.svc?action=GetItem'))) {
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
      
      if (url && (url.includes('service.svc') || url.includes('FindConversation') || url.includes('service.svc?action=GetItem'))) {
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