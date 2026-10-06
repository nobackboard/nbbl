(function () {
  'use strict';

  var measurementId =
    (window.__GA_MEASUREMENT_ID__ || '').trim() || 'G-F7BQEEZ5DM';

  function noopTrackEvent() {}

  window.trackEvent = noopTrackEvent;

  if (!measurementId) {
    return;
  }

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', measurementId);

  var gtagScript = document.createElement('script');
  gtagScript.async = true;
  gtagScript.src =
    'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId);
  document.head.appendChild(gtagScript);

  window.trackEvent = function trackEvent(name, params) {
    if (!window.gtag) return;
    window.gtag('event', name, params || {});
  };

  var GOFUNDME_PATH = '/f/no-backboard-basketball-gym';
  var GYM_HOST = 'nobackboardbasketballgym.com';

  function socialPlatform(hostname) {
    var host = (hostname || '').toLowerCase();
    if (host.indexOf('instagram.com') !== -1) return 'instagram';
    if (host.indexOf('tiktok.com') !== -1) return 'tiktok';
    if (host.indexOf('youtube.com') !== -1 || host.indexOf('youtu.be') !== -1) return 'youtube';
    if (host.indexOf('facebook.com') !== -1 || host.indexOf('fb.com') !== -1) return 'facebook';
    if (host.indexOf('linkedin.com') !== -1) return 'linkedin';
    if (host === 'x.com' || host.indexOf('twitter.com') !== -1) return 'x';
    return null;
  }

  function normalizeHref(anchor) {
    var href = anchor.getAttribute('href');
    if (!href) return null;
    try {
      return new URL(href, window.location.href);
    } catch (e) {
      return null;
    }
  }

  document.addEventListener(
    'click',
    function (e) {
      var anchor = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!anchor) return;

      var url = normalizeHref(anchor);
      if (!url || url.protocol === 'javascript:') return;

      var host = url.hostname.toLowerCase();
      var path = url.pathname.toLowerCase();

      if (
        host.indexOf('gofundme.com') !== -1 &&
        (path === GOFUNDME_PATH || path === GOFUNDME_PATH + '/')
      ) {
        window.trackEvent('gofundme_click');
        return;
      }

      if (host === GYM_HOST || host.endsWith('.' + GYM_HOST)) {
        window.trackEvent('outbound_click', { url: url.href });
        return;
      }

      var platform = socialPlatform(host);
      if (platform && url.origin !== window.location.origin) {
        window.trackEvent('outbound_social_click', { platform: platform });
      }
    },
    true
  );

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'hsFormCallback' && data.eventName === 'onFormSubmitted') {
      window.trackEvent('waitlist_submit', {
        form: data.id != null ? String(data.id) : 'hubspot_embed',
      });
    }
  });
})();
