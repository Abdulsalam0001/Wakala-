(function () {
  function normalizeAuthLinks() {
    document.querySelectorAll('[data-auth]').forEach(function (element) {
      if (element.dataset.authHandled === 'true') {
        return;
      }

      if (element.hasAttribute('data-auth-modal')) {
        element.dataset.authHandled = 'true';
        return;
      }

      const href = element.getAttribute('href');
      if (href && href !== '#') {
        element.dataset.authHandled = 'true';
        return;
      }

      element.dataset.authHandled = 'true';

      element.addEventListener('click', function (event) {
        event.preventDefault();
        const authType = element.dataset.auth || 'login';
        const target = authType === 'register' ? './register.html' : './login.html';
        window.location.assign(target);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', normalizeAuthLinks, { once: true });
  } else {
    normalizeAuthLinks();
  }
})();
