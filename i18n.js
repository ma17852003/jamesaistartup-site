/* James Wu AI Startup site — auto language switch by visitor country.
   Chinese-speaking regions (CN/TW/HK/MO/SG) get zh-Hant; everyone else gets English.
   Falls back to browser language if geolocation lookup fails, and always offers a manual toggle
   because IP geolocation is wrong often enough (VPN, corporate proxy) that visitors need an escape hatch. */
(function () {
  var CN_COUNTRIES = ['CN', 'TW', 'HK', 'MO', 'SG'];
  var STORAGE_KEY = 'jws_lang';
  // Set true the moment a language is authoritatively decided (manual click, geo result,
  // or fallback timeout) so a late-arriving geo response can never clobber a manual choice
  // the visitor made while detection was still in flight.
  var settled = false;

  function fallbackLang() {
    var nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
    return nav.indexOf('zh') === 0 ? 'zh' : 'en';
  }

  function applyLang(lang) {
    lang = lang === 'en' ? 'en' : 'zh';
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-Hant';
    document.documentElement.setAttribute('data-lang', lang);

    var dict = window.I18N_DICT || {};
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var entry = dict[el.getAttribute('data-i18n')];
      if (!entry) return;
      var val = entry[lang] !== undefined ? entry[lang] : entry.zh;
      if (val !== undefined) el.innerHTML = val;
    });

    if (dict['meta.title']) document.title = dict['meta.title'][lang] || dict['meta.title'].zh;
    var descEl = document.querySelector('meta[name="description"]');
    if (descEl && dict['meta.description']) descEl.setAttribute('content', dict['meta.description'][lang] || dict['meta.description'].zh);
    var ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle && dict['og.title']) ogTitle.setAttribute('content', dict['og.title'][lang] || dict['og.title'].zh);
    var ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc && dict['og.description']) ogDesc.setAttribute('content', dict['og.description'][lang] || dict['og.description'].zh);
    var ogLocale = document.querySelector('meta[property="og:locale"]');
    if (ogLocale) ogLocale.setAttribute('content', lang === 'en' ? 'en_US' : 'zh_TW');

    var toggle = document.getElementById('lang-toggle-btn');
    if (toggle) toggle.textContent = lang === 'en' ? '中文' : 'EN';
  }

  function setLang(lang, persist) {
    settled = true; // a manual choice always wins over any pending geo lookup
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    }
    applyLang(lang);
  }

  function mountToggle(initialLang) {
    var btn = document.createElement('button');
    btn.id = 'lang-toggle-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Switch language / 切換語言');
    btn.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:999;background:#6c63ff;' +
      'color:#fff;border:none;border-radius:100px;padding:10px 18px;font-weight:700;font-size:13px;' +
      'cursor:pointer;box-shadow:0 4px 20px rgba(108,99,255,.4);font-family:Inter,sans-serif;';
    btn.textContent = initialLang === 'en' ? '中文' : 'EN';
    btn.addEventListener('click', function () {
      var current = document.documentElement.getAttribute('data-lang') || 'zh';
      setLang(current === 'en' ? 'zh' : 'en', true);
    });
    document.body.appendChild(btn);
  }

  function init() {
    var cached = null;
    try { cached = localStorage.getItem(STORAGE_KEY); } catch (e) {}

    if (cached === 'en' || cached === 'zh') {
      applyLang(cached);
      mountToggle(cached);
      return; // manual/remembered preference wins — skip geo lookup entirely
    }

    mountToggle('zh');
    var timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      applyLang(fallbackLang());
    }, 1200);

    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    fetch('https://ipapi.co/json/', controller ? { signal: controller.signal } : undefined)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        var cc = data && data.country_code ? String(data.country_code).toUpperCase() : null;
        applyLang(cc && CN_COUNTRIES.indexOf(cc) !== -1 ? 'zh' : 'en');
      })
      .catch(function () {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        applyLang(fallbackLang());
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
