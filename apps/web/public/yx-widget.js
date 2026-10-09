/*
 * YukthiX help widget loader (SD-2.20). One external script, no inline code and no eval, so a site's Content Security
 * Policy needs only our origin in script-src and frame-src. Usage on the company's page:
 *   <script src="https://<yukthix-web>/yx-widget.js" data-key="wk_..." async></script>
 * When the visitor is signed in on the company's site, the company's own server signs a short token (HS256 with the
 * widget's secret, audience = the widget key, at most 10 minutes, a unique jti) and the page calls
 *   YukthiXWidget.identify(token)
 * The token goes only to our frame, by postMessage to our exact origin. Nothing is stored on the company's site.
 */
(function () {
  'use strict';
  var script = document.currentScript;
  if (!script || !script.dataset || !/^wk_[A-Za-z0-9_-]{20,36}$/.test(script.dataset.key || '')) return;
  var origin = new URL(script.src).origin;
  var key = script.dataset.key;
  var token = null;
  var ready = false;
  var frame = null;

  function send() {
    if (frame && ready && token) frame.contentWindow.postMessage({ type: 'yx-identify', token: token }, origin);
  }

  function open() {
    if (!frame) {
      frame = document.createElement('iframe');
      frame.src = origin + '/yx/widget/' + encodeURIComponent(key);
      frame.title = 'Help';
      frame.setAttribute('allow', 'clipboard-write');
      var s = frame.style;
      s.position = 'fixed';
      s.right = '16px';
      s.bottom = '80px';
      s.width = 'min(400px, calc(100vw - 32px))';
      s.height = 'min(640px, calc(100vh - 112px))';
      s.border = '1px solid rgba(0,0,0,0.15)';
      s.borderRadius = '12px';
      s.boxShadow = '0 8px 32px rgba(0,0,0,0.18)';
      s.background = '#fff';
      s.zIndex = '2147483646';
      document.body.appendChild(frame);
    } else {
      frame.style.display = frame.style.display === 'none' ? 'block' : 'none';
    }
  }

  window.addEventListener('message', function (e) {
    if (e.origin !== origin || !frame || e.source !== frame.contentWindow) return;
    if (e.data && e.data.type === 'yx-widget-ready') {
      ready = true;
      send();
    }
  });

  var button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Help';
  button.setAttribute('aria-label', 'Open help');
  var b = button.style;
  b.position = 'fixed';
  b.right = '16px';
  b.bottom = '16px';
  b.padding = '12px 20px';
  b.borderRadius = '999px';
  b.border = '1px solid rgba(0,0,0,0.2)';
  b.background = '#1f3fbf';
  b.color = '#fff';
  b.font = '600 14px system-ui, sans-serif';
  b.cursor = 'pointer';
  b.zIndex = '2147483647';
  button.addEventListener('click', open);

  function mount() {
    document.body.appendChild(button);
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);

  window.YukthiXWidget = {
    /** The company's server-signed token for the signed-in visitor. */
    identify: function (t) {
      if (typeof t === 'string' && t.length > 20) {
        token = t;
        send();
      }
    },
    open: open,
  };
})();
