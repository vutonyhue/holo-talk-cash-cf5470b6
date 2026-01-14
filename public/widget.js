/**
 * FunChat Widget SDK
 * Embed FunChat into any website
 * 
 * Usage:
 * <script src="https://funchat.app/widget.js"></script>
 * <script>
 *   FunChatWidget.init({
 *     token: 'wt_xxxxx',
 *     theme: 'light',
 *     position: 'bottom-right',
 *     buttonColor: '#7C3AED'
 *   });
 * </script>
 */

(function(window, document) {
  'use strict';

  const FunChatWidget = {
    // Default configuration
    config: {
      token: null,
      theme: 'auto',
      position: 'bottom-right',
      buttonColor: '#7C3AED',
      buttonIcon: 'chat',
      width: 380,
      height: 520,
      showButton: true,
      autoOpen: false,
      zIndex: 999999,
      baseUrl: window.location.origin,
      greeting: null,
      offsetX: 20,
      offsetY: 20,
    },

    // State
    isOpen: false,
    isReady: false,
    unreadCount: 0,
    container: null,
    button: null,
    iframe: null,

    /**
     * Initialize the widget
     */
    init: function(options) {
      if (!options || !options.token) {
        console.error('[FunChat] Token is required');
        return;
      }

      Object.assign(this.config, options);
      
      this.createStyles();
      this.createContainer();
      
      if (this.config.showButton) {
        this.createButton();
      }
      
      this.createIframe();
      this.setupListeners();

      if (this.config.autoOpen) {
        this.open();
      }

      console.log('[FunChat] Widget initialized');
    },

    /**
     * Create widget styles
     */
    createStyles: function() {
      const styleId = 'funchat-widget-styles';
      if (document.getElementById(styleId)) return;

      const styles = document.createElement('style');
      styles.id = styleId;
      styles.textContent = `
        .fc-widget-container {
          position: fixed;
          z-index: ${this.config.zIndex};
          display: none;
          flex-direction: column;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05);
          transition: transform 0.3s ease, opacity 0.3s ease;
          transform: translateY(20px);
          opacity: 0;
        }
        
        .fc-widget-container.fc-open {
          display: flex;
          transform: translateY(0);
          opacity: 1;
        }
        
        .fc-widget-container.fc-position-bottom-right {
          bottom: ${this.config.offsetY + 70}px;
          right: ${this.config.offsetX}px;
        }
        
        .fc-widget-container.fc-position-bottom-left {
          bottom: ${this.config.offsetY + 70}px;
          left: ${this.config.offsetX}px;
        }
        
        .fc-widget-container.fc-position-top-right {
          top: ${this.config.offsetY}px;
          right: ${this.config.offsetX}px;
        }
        
        .fc-widget-container.fc-position-top-left {
          top: ${this.config.offsetY}px;
          left: ${this.config.offsetX}px;
        }
        
        .fc-widget-iframe {
          width: ${this.config.width}px;
          height: ${this.config.height}px;
          border: none;
          background: #fff;
        }
        
        .fc-widget-button {
          position: fixed;
          z-index: ${this.config.zIndex - 1};
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: ${this.config.buttonColor};
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        
        .fc-widget-button:hover {
          transform: scale(1.05);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
        }
        
        .fc-widget-button:active {
          transform: scale(0.95);
        }
        
        .fc-widget-button.fc-position-bottom-right {
          bottom: ${this.config.offsetY}px;
          right: ${this.config.offsetX}px;
        }
        
        .fc-widget-button.fc-position-bottom-left {
          bottom: ${this.config.offsetY}px;
          left: ${this.config.offsetX}px;
        }
        
        .fc-widget-button.fc-position-top-right {
          top: ${this.config.offsetY}px;
          right: ${this.config.offsetX}px;
        }
        
        .fc-widget-button.fc-position-top-left {
          top: ${this.config.offsetY}px;
          left: ${this.config.offsetX}px;
        }
        
        .fc-widget-button svg {
          width: 28px;
          height: 28px;
          fill: #fff;
        }
        
        .fc-widget-badge {
          position: absolute;
          top: -4px;
          right: -4px;
          min-width: 20px;
          height: 20px;
          padding: 0 6px;
          border-radius: 10px;
          background: #ef4444;
          color: #fff;
          font-size: 12px;
          font-weight: 600;
          display: none;
          align-items: center;
          justify-content: center;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        .fc-widget-badge.fc-has-unread {
          display: flex;
        }
        
        @media (max-width: 480px) {
          .fc-widget-container {
            position: fixed;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            width: 100% !important;
            height: 100% !important;
            border-radius: 0;
          }
          
          .fc-widget-iframe {
            width: 100% !important;
            height: 100% !important;
          }
        }
      `;
      document.head.appendChild(styles);
    },

    /**
     * Create container element
     */
    createContainer: function() {
      this.container = document.createElement('div');
      this.container.className = `fc-widget-container fc-position-${this.config.position}`;
      document.body.appendChild(this.container);
    },

    /**
     * Create floating button
     */
    createButton: function() {
      this.button = document.createElement('button');
      this.button.className = `fc-widget-button fc-position-${this.config.position}`;
      this.button.setAttribute('aria-label', 'Open chat');
      
      // Chat icon SVG
      this.button.innerHTML = `
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
          <path d="M7 9h10v2H7zm0-3h10v2H7z"/>
        </svg>
        <span class="fc-widget-badge">0</span>
      `;
      
      this.button.addEventListener('click', () => this.toggle());
      document.body.appendChild(this.button);
    },

    /**
     * Create iframe
     */
    createIframe: function() {
      this.iframe = document.createElement('iframe');
      this.iframe.className = 'fc-widget-iframe';
      this.iframe.setAttribute('allow', 'microphone; camera');
      
      const params = new URLSearchParams({
        token: this.config.token,
        theme: this.config.theme,
      });
      
      this.iframe.src = `${this.config.baseUrl}/widget?${params.toString()}`;
      this.container.appendChild(this.iframe);
    },

    /**
     * Set up event listeners
     */
    setupListeners: function() {
      // Listen for messages from iframe
      window.addEventListener('message', (event) => {
        // Verify origin if needed
        const data = event.data || {};
        
        switch (data.type) {
          case 'funchat:ready':
            this.isReady = true;
            this.dispatchEvent('ready');
            break;
            
          case 'funchat:close':
            this.close();
            break;
            
          case 'funchat:minimize':
            this.close();
            break;
            
          case 'funchat:unreadCount':
            this.updateBadge(data.count || 0);
            break;
            
          case 'funchat:newMessage':
            this.dispatchEvent('message', data.message);
            break;
        }
      });

      // Close on escape key
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && this.isOpen) {
          this.close();
        }
      });
    },

    /**
     * Open chat window
     */
    open: function() {
      if (this.isOpen) return;
      
      this.isOpen = true;
      this.container.classList.add('fc-open');
      
      // Send message to iframe
      if (this.iframe && this.iframe.contentWindow) {
        this.iframe.contentWindow.postMessage({ type: 'widget:open' }, '*');
      }
      
      // Reset unread count
      this.updateBadge(0);
      
      this.dispatchEvent('open');
    },

    /**
     * Close chat window
     */
    close: function() {
      if (!this.isOpen) return;
      
      this.isOpen = false;
      this.container.classList.remove('fc-open');
      
      // Send message to iframe
      if (this.iframe && this.iframe.contentWindow) {
        this.iframe.contentWindow.postMessage({ type: 'widget:close' }, '*');
      }
      
      this.dispatchEvent('close');
    },

    /**
     * Toggle chat window
     */
    toggle: function() {
      if (this.isOpen) {
        this.close();
      } else {
        this.open();
      }
    },

    /**
     * Update unread badge
     */
    updateBadge: function(count) {
      this.unreadCount = count;
      
      if (this.button) {
        const badge = this.button.querySelector('.fc-widget-badge');
        if (badge) {
          badge.textContent = count > 99 ? '99+' : count;
          badge.classList.toggle('fc-has-unread', count > 0);
        }
      }
      
      this.dispatchEvent('unread', { count });
    },

    /**
     * Set theme
     */
    setTheme: function(theme) {
      this.config.theme = theme;
      
      if (this.iframe && this.iframe.contentWindow) {
        this.iframe.contentWindow.postMessage({ 
          type: 'widget:setTheme', 
          theme 
        }, '*');
      }
    },

    /**
     * Destroy widget
     */
    destroy: function() {
      if (this.container) {
        this.container.remove();
        this.container = null;
      }
      
      if (this.button) {
        this.button.remove();
        this.button = null;
      }
      
      this.iframe = null;
      this.isOpen = false;
      this.isReady = false;
      
      this.dispatchEvent('destroy');
    },

    /**
     * Event handling
     */
    _handlers: {},
    
    on: function(event, callback) {
      if (!this._handlers[event]) {
        this._handlers[event] = [];
      }
      this._handlers[event].push(callback);
      return this;
    },
    
    off: function(event, callback) {
      if (!this._handlers[event]) return this;
      
      if (callback) {
        this._handlers[event] = this._handlers[event].filter(cb => cb !== callback);
      } else {
        delete this._handlers[event];
      }
      return this;
    },
    
    dispatchEvent: function(event, data) {
      if (!this._handlers[event]) return;
      
      this._handlers[event].forEach(callback => {
        try {
          callback(data);
        } catch (e) {
          console.error('[FunChat] Event handler error:', e);
        }
      });
    }
  };

  // Expose to global scope
  window.FunChatWidget = FunChatWidget;

})(window, document);
