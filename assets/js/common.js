/* ============================================================
 * 公共工具脚本 common.js
 * 跨页复用：HTML 转义、正则转义、轻提示、TTS 底层。
 * 依赖：轻提示需要页面内存在 #toast 元素。
 * ============================================================ */
(function (global) {
  'use strict';

  // HTML 转义，防止注入与标签被拆开
  global.escapeHtml = function (s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  // 正则元字符转义，用于把普通文本拼进 RegExp
  global.escapeRe = function (s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  // 轻提示（2 秒后自动消失）
  var _toastTimer = null;
  global.showToast = function (msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2000);
  };

  // 优先走 App 内置原生 TTS 桥梁；返回是否已被桥接管
  global.androidTTS = function (text) {
    if (window.AndroidTTS && typeof window.AndroidTTS.speak === 'function') {
      window.AndroidTTS.speak(text);
      return true;
    }
    return false;
  };

  // Web Speech 兜底朗读：强制中文，优先高质量中文引擎
  global.webSpeak = function (text, rate) {
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      global.showToast('当前设备不支持语音朗读');
      return;
    }
    window.speechSynthesis.cancel();
    var msg = new SpeechSynthesisUtterance(text);
    msg.lang = 'zh-CN';
    msg.rate = rate || 0.85;
    msg.pitch = 1;
    var voices = window.speechSynthesis.getVoices() || [];
    var best = voices.find(function (v) {
      return v.lang === 'zh-CN' && /Ting|Google|Xiaoxiao|Yunxi/i.test(v.name);
    });
    if (!best) {
      best = voices.find(function (v) { return v.lang && v.lang.indexOf('zh') === 0; });
    }
    if (best) msg.voice = best;
    setTimeout(function () { window.speechSynthesis.speak(msg); }, 100);
  };
})(window);
