// Background service worker for intercepting network requests
let interceptedRequests = [];



let debuggerTabs = new Set();
let responseBodyCache = new Map(); // Cache for matching request/response pairs

let downloadToken = " ";

// Listen for web requests
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    console.log("BACKGROUND --- ", details);
    // Log ALL requests first for debugging - but filter out too much noise
    if (details.url.includes('service.svc') || details.url.includes('FindConversation')) {
      console.log('🔍 Service worker request detected:', details.url);
    }
    
    // Always capture service.svc requests regardless of filtering
    if (details.url.includes('service.svc') || isRelevantOutlookRequest(details.url)) {
      console.log('✅ Intercepted relevant request:', details.url);
      
      const requestData = {
        id: details.requestId,
        url: details.url,
        method: details.method,
        timestamp: Date.now(),
        requestBody: details.requestBody,
        type: details.type,
        initiator: details.initiator
      };
      
      interceptedRequests.push(requestData);
      
      // Keep only last 100 requests to prevent memory issues
      if (interceptedRequests.length > 100) {
        interceptedRequests.shift();
      }
    }
  },
  {
    urls: [
        "<all_urls>"
    ],
    // types: ["xmlhttprequest", "fetch", "other"]
  },
  ["requestBody"]
);

// Listen for response headers and bodies
chrome.webRequest.onCompleted.addListener(
  (details) => {
    console.log(details);
    // Focus on service.svc requests
    if (details.url.includes('service.svc')) {
      console.log('🎯 Service.svc request completed:', details.url, 'Status:', details.statusCode);
    }
    
    if (details.url.includes('service.svc') || isRelevantOutlookRequest(details.url)) {
      console.log('✅ Relevant request completed:', details.url, 'Status:', details.statusCode);
      
      // Find the corresponding request
      const requestIndex = interceptedRequests.findIndex(req => req.id === details.requestId);
      if (requestIndex !== -1) {
        interceptedRequests[requestIndex].responseHeaders = details.responseHeaders;
        interceptedRequests[requestIndex].statusCode = details.statusCode;
        interceptedRequests[requestIndex].completed = true;
        
        console.log('Updated request data:', interceptedRequests[requestIndex]);
      }
    }
  },
  {
    urls: [
      "*://outlook.live.com/*",
      "*://outlook.office.com/*", 
      "*://outlook.office365.com/*",
      "*://*.outlook.com/*",
      "*://*.office.com/*",
      "*://outlook-sdf.office.com/*"
    ],
    types: ["xmlhttprequest"]
  },
  ["responseHeaders"]
);



// // ==== NEW DEBUGGER API FOR RESPONSE BODIES ====
// // Auto-attach debugger to Outlook tabs
// chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
//     // Also try to find and attach to the service worker
//     findAndAttachToServiceWorker(tab);

//     if (changeInfo.status === 'complete' && 
//         tab.url && 
//         (tab.url.includes('outlook') || tab.url.includes('office'))) {
        
//         // Don't attach if already attached
//         if (debuggerTabs.has(tabId)) return;
        
//         chrome.debugger.attach({ tabId }, "1.3", () => {
//             if (chrome.runtime.lastError) {
//                 console.error('❌ Debugger attach failed:', chrome.runtime.lastError.message);
//                 return;
//             }
            
//             debuggerTabs.add(tabId);
//             console.log('🔧 Debugger attached to tab:', tabId, 'URL:', tab.url);
            
//             // Enable network domain
//             chrome.debugger.sendCommand({ tabId }, "Network.enable", {}, (result) => {
//                 if (chrome.runtime.lastError) {
//                     console.error('❌ Network.enable failed:', chrome.runtime.lastError.message);
//                 } else {
//                     console.log('✅ Network domain enabled for tab:', tabId);
//                 }
//             });
//         });
//     }
// });

// // Listen for network events from debugger (THIS GETS SERVICE WORKER RESPONSES!)
// chrome.debugger.onEvent.addListener((source, method, params) => {
//     if (method === 'Network.responseReceived') {
//         const url = params.response.url;
//         const requestId = params.requestId;
        
//         // Filter for relevant requests
//         if (url.includes('service.svc') || 
//             url.includes('FindConversation') || 
//             url.includes('FindFolder') ||
//             isRelevantOutlookRequest(url)) {
            
//             console.log('🎯 DEBUGGER: Response detected for:', url);
//             console.log('Request ID:', requestId);
//             console.log('Status:', params.response.status);
//             console.log('Headers:', params.response.headers);
            
//             // Get the response body
//             chrome.debugger.sendCommand(source, 'Network.getResponseBody', {
//                 requestId: requestId
//             }, (response) => {
//                 if (chrome.runtime.lastError) {
//                     console.error('❌ Failed to get response body:', chrome.runtime.lastError.message);
//                     return;
//                 }
                
//                 if (response && response.body) {
//                     console.log('🎉 ===============================================');
//                     console.log('📦 SERVICE WORKER RESPONSE BODY CAPTURED!');
//                     console.log('URL:', url);
//                     console.log('Status:', params.response.status);
//                     console.log('Body Length:', response.body.length);
//                     console.log('Body:', response.body);
//                     console.log('===============================================');
                    
//                     // Try to parse JSON
//                     try {
//                         const jsonData = JSON.parse(response.body);
//                         console.log('📊 Parsed JSON Response:', jsonData);
//                     } catch (e) {
//                         console.log('📄 Response is not JSON format');
//                     }
                    
//                     // Store in cache for correlation with webRequest data
//                     responseBodyCache.set(url + '_' + Date.now(), {
//                         url: url,
//                         body: response.body,
//                         status: params.response.status,
//                         headers: params.response.headers,
//                         timestamp: Date.now(),
//                         source: 'debugger'
//                     });
                    
//                     // Try to find matching webRequest entry and update it
//                     const matchingRequest = interceptedRequests.find(req => 
//                         req.url === url && !req.responseBody
//                     );
                    
//                     if (matchingRequest) {
//                         matchingRequest.responseBody = response.body;
//                         matchingRequest.debuggerStatus = params.response.status;
//                         matchingRequest.hasResponseBody = true;
//                         console.log('✅ Matched debugger response to webRequest entry');
//                     }
                    
//                 } else {
//                     console.log('❌ No response body available for:', url);
//                 }
//             });
//         }
//     }
// });

// // Clean up debugger when tabs are closed
// chrome.tabs.onRemoved.addListener((tabId) => {
//     if (debuggerTabs.has(tabId)) {
//         chrome.debugger.detach({ tabId }, () => {
//             if (chrome.runtime.lastError) {
//                 console.log('Debugger detach error (expected):', chrome.runtime.lastError.message);
//             }
//         });
//         debuggerTabs.delete(tabId);
//         console.log('🔧 Debugger detached from closed tab:', tabId);
//     }
// });

// Function to find and attach to the Outlook Service Worker
function findAndAttachToServiceWorker(tab) {
  if (!tab || !tab.url || !(tab.url.includes('outlook') || tab.url.includes('office'))) {
    return; // Not a relevant tab
  }

  chrome.debugger.getTargets((targets) => {
    const serviceWorkerTarget = targets.find(t => 
      t.type === 'service_worker' && 
      (t.url.includes('outlook') || t.url.includes('office'))
    );

    if (serviceWorkerTarget && !debuggerTabs.has(serviceWorkerTarget.id)) {
      console.log('🎯 Found Outlook Service Worker target:', serviceWorkerTarget.url);
      const targetId = { targetId: serviceWorkerTarget.id };

      chrome.debugger.attach(targetId, "1.3", () => {
        if (chrome.runtime.lastError) {
          console.error('❌ Service Worker debugger attach failed:', chrome.runtime.lastError.message);
          return;
        }

        debuggerTabs.add(serviceWorkerTarget.id); // Track by target ID
        console.log('🔧 Debugger attached to Service Worker:', serviceWorkerTarget.id);

        chrome.debugger.sendCommand(targetId, "Network.enable", {}, (result) => {
          if (chrome.runtime.lastError) {
            console.error('❌ SW Network.enable failed:', chrome.runtime.lastError.message);
          } else {
            console.log('✅ Network domain enabled for Service Worker:', serviceWorkerTarget.id);
          }
        });
      });
    }
  });
}

// Handle debugger detach events
chrome.debugger.onDetach.addListener((source, reason) => {
    const tabId = source.tabId;
    if (debuggerTabs.has(tabId)) {
        debuggerTabs.delete(tabId);
        console.log('🔧 Debugger detached from tab:', tabId, 'Reason:', reason);
    }
});



// Function to check if request is relevant for email/task analysis
function isRelevantOutlookRequest(url) {
  // Always capture service.svc requests
  if (url.includes('service.svc')) {
    return true;
  }
  
  // Look for API endpoints related to messages, mail, tasks
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
    'ReadItem'
  ];
  
  // Log for debugging specific patterns
  const isRelevant = relevantPatterns.some(pattern => url.includes(pattern));
  
  return isRelevant;
}

// Add 'downloads' permission to your manifest.json
// "permissions": ["downloads", ...]

/**
 * Handles attachment download using fetch and chrome.downloads API
 * @param {string} attachmentId - The ID of the attachment to download
 * @param {string} authToken - The authentication token for the request
 * @returns {Promise<Object>} - A response-like object
 */
async function downloadAttachment(attachmentId, authToken) {
  const baseUrl = 'https://attachments.office.net/owa/rahul.soni%40iimjobs.com/service.svc/s/DownloadMessage';
  
  // Create the download URL with parameters
  const downloadUrl = new URL(baseUrl);
  downloadUrl.searchParams.append('id', attachmentId);
  downloadUrl.searchParams.append('outputFormat', '0');
  downloadUrl.searchParams.append('token', authToken);

  try {
    // First, fetch the attachment as a blob
    const response = await fetch(downloadUrl.toString(), {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'Accept': '*/*',
        'Cache-Control': 'no-cache'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Clone the response to read it multiple times
    const responseClone = response.clone();
    
    // First, read as text for logging
    const text = await response.text();
    console.log('Response (truncated):', text.length > 500 ? text.substring(0, 500) + '...' : text);
    
    // Then use the clone to get the blob
    const blob = await responseClone.blob();
    
    // Create a blob URL and trigger download
    const blobUrl = URL.createObjectURL(blob);
    
    // Use chrome.downloads.download to save the file
    const downloadId = await new Promise((resolve, reject) => {
      chrome.downloads.download({
        url: blobUrl,
        filename: `attachment_${Date.now()}.bin`,
        saveAs: false,
        conflictAction: 'uniquify'
      }, (downloadId) => {
        // Clean up the blob URL
        URL.revokeObjectURL(blobUrl);
        
        if (chrome.runtime.lastError) {
          console.error('Download error details:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          console.log('Download started with ID:', downloadId);
          resolve(downloadId);
        }
      });
    });

    // Return a response-like object for compatibility
    return {
      ok: true,
      status: 200,
      text: () => Promise.resolve(''),
      json: () => Promise.resolve({})
    };
    
  } catch (error) {
    console.error('Error in downloadAttachment:', error);
    throw error;
  }
}

// Example usage:
// const attachmentId = 'AAkALgAAAAAAHYQDEapmEc2byACqAC%2FEWg0AwOFyMLKPbU65g%2Fp%2BPPZGHQABUFgQMwAA';
// const authToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IktBbExZZGdhTkZxSll4TG1mRFpnZ3lrVmcyND0i...'; // Your full token
// downloadAttachment(attachmentId, authToken)
//   .then(response => response.blob())
//   .then(blob => {
//     // Handle the downloaded blob (e.g., save as file)
//     const url = window.URL.createObjectURL(blob);
//     const a = document.createElement('a');
//     a.href = url;
//     a.download = 'attachment.bin'; // You might want to set a proper filename
//     document.body.appendChild(a);
//     a.click();
//     document.body.removeChild(a);
//   })
//   .catch(error => console.error('Download failed:', error));

// Handle messages from content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_INTERCEPTED_REQUESTS') {
    sendResponse({ requests: interceptedRequests });
  } else if (message.type === 'CLEAR_REQUESTS') {
    interceptedRequests = [];
    sendResponse({ success: true });
  } else if (message.type === 'ANALYZE_EMAIL_CONTENT') {
    // Analyze email content for tasks
    const tasks = analyzeEmailForTasks(message.content);
    sendResponse({ tasks: tasks });
  } else if (message.type === 'EARLY_NETWORK_DATA') {
    // Handle early network data capture
    console.log('📨 Received early network data:', message.data);


    if (message.data.url.includes('service.svc?action=GetAttachmentDownloadToken')) {
      let responseData = typeof message.data.response === 'string' 
      ? JSON.parse(message.data.response) 
      : message.data.response;
      downloadToken = responseData;
      // console.log(responseData)
    }

    if(message.data.url.includes('service.svc?action=GetItem')) {
      let responseData1 = typeof message.data.response === 'string' 
      ? JSON.parse(message.data.response) 
      : message.data.response;
      let messageId = responseData1?.Body?.ResponseMessages?.Items?.[0]?.Items?.[0]?.ItemId?.Id;
      if(messageId && downloadToken) {
        console.log("()()()()()()()()", messageId, downloadToken) 

      downloadAttachment(messageId, downloadToken)
        .then(response => response.text())
        .then(text => {
          // Log truncated response (first 500 chars)
          console.log('Attachment response (truncated):', 
            text.length > 500 ? text.substring(0, 500) + '...' : text
          );
        })
        .catch(error => {
          console.error('Error downloading attachment:', error);
        });

      }
      else{
        console.log("+_+_+_+_++_+__++_+")
        chrome.notifications.create('', {
          type: 'basic',
          title: 'Info',
          message: 'Indexing the attachments...',
          iconUrl: 'icon.png'
        });
      }
      
      // console.log(responseData1)
    }
    
    // Add to intercepted requests
    const requestData = {
      id: 'early_' + Date.now(),
      url: message.data.url,
      method: message.data.method || 'unknown',
      timestamp: Date.now(),
      statusCode: message.data.status,
      completed: true,
      source: 'early_capture'
    };
    
    interceptedRequests.push(requestData);
    
    // Try to extract conversation data from response
    if (message.data.response) {
      const conversationData = extractConversationData(message.data.response);
      if (conversationData) {
        console.log('📧 Extracted conversation data:', conversationData);
        
        // Analyze each message for tasks
        conversationData.forEach((conv, index) => {
          if (conv.content) {
            const tasks = analyzeEmailForTasks(conv.content);
            if (tasks.length > 0) {
              console.log(`📋 Tasks found in conversation ${index}:`, tasks);
            }
          }
        });
      }
    }
    
    sendResponse({ success: true });
  }
});

// Function to analyze email content for tasks
function analyzeEmailForTasks(emailContent) {
  if (!emailContent || typeof emailContent !== 'string') {
    return [];
  }
  
  const taskIndicators = [
    /please\s+(?:can\s+you\s+)?(?:do|complete|finish|handle|take care of|work on)\s+(.+?)(?:\.|$)/gi,
    /(?:could\s+you|can\s+you)\s+(?:please\s+)?(.+?)(?:\?|\.|$)/gi,
    /(?:need\s+you\s+to|you\s+need\s+to|you\s+should)\s+(.+?)(?:\.|$)/gi,
    /(?:task|todo|to-do|action item|follow up):\s*(.+?)(?:\.|$)/gi,
    /(?:deadline|due\s+date|due\s+by):\s*(.+?)(?:\.|$)/gi,
    /(?:remember\s+to|don't\s+forget\s+to)\s+(.+?)(?:\.|$)/gi
  ];
  
  const tasks = [];
  
  taskIndicators.forEach(regex => {
    let match;
    while ((match = regex.exec(emailContent)) !== null) {
      if (match[1] && match[1].trim().length > 5) {
        tasks.push({
          text: match[1].trim(),
          fullMatch: match[0].trim(),
          type: getTaskType(match[0])
        });
      }
    }
  });
  
  return tasks;
}

function getTaskType(matchText) {
  if (matchText.toLowerCase().includes('deadline') || matchText.toLowerCase().includes('due')) {
    return 'deadline';
  } else if (matchText.toLowerCase().includes('follow up')) {
    return 'followup';
  } else if (matchText.toLowerCase().includes('task') || matchText.toLowerCase().includes('todo')) {
    return 'explicit_task';
  } else {
    return 'implicit_task';
  }
}

// Function to extract conversation data from Outlook service responses
function extractConversationData(responseText) {
  try {
    // Try to parse as JSON first
    let data;
    if (responseText.startsWith('<')) {
      // Likely XML/SOAP response from EWS
      return extractFromXMLResponse(responseText);
    } else {
      data = JSON.parse(responseText);
    }
    
    const conversations = [];
    
    // Handle different response structures
    if (data.Body && data.Body.FindConversationResponse) {
      // EWS FindConversation response
      const convResponse = data.Body.FindConversationResponse;
      if (convResponse.Conversations && convResponse.Conversations.Conversation) {
        const convs = Array.isArray(convResponse.Conversations.Conversation) 
          ? convResponse.Conversations.Conversation 
          : [convResponse.Conversations.Conversation];
          
        convs.forEach(conv => {
          if (conv.UniqueRecipients) {
            conversations.push({
              id: conv.ConversationId?.Id,
              topic: conv.ConversationTopic,
              recipients: conv.UniqueRecipients,
              content: conv.ConversationTopic // Basic content
            });
          }
        });
      }
    }
    
    return conversations.length > 0 ? conversations : null;
  } catch (e) {
    console.log('Could not parse conversation response:', e);
    return null;
  }
}

function extractFromXMLResponse(xmlText) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    
    const conversations = [];
    const convElements = doc.querySelectorAll('Conversation');
    
    convElements.forEach(conv => {
      const topic = conv.querySelector('ConversationTopic')?.textContent;
      const id = conv.querySelector('ConversationId')?.getAttribute('Id');
      
      if (topic) {
        conversations.push({
          id: id,
          topic: topic,
          content: topic
        });
      }
    });
    
    return conversations.length > 0 ? conversations : null;
  } catch (e) {
    console.log('Could not parse XML response:', e);
    return null;
  }
}