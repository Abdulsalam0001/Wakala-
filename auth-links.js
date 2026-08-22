(() => {
  const page = window.location.pathname.split('/').pop().toLowerCase();

  // Pages that should NOT receive the public auth navigation.
  const excludedPages = new Set([
    'login.html',
    'register.html',
    'dashboard.html',
    'deposit.html',
    'transfer.html',
    'crypto-deposit.html',
    'creator-jobs.html',
    'admin'
  ]);

  if (excludedPages.has(page)) return;

  // Don't inject twice.
  if (document.querySelector('[data-site-auth-links]')) return;

  const links = document.createElement('nav');

  links.dataset.siteAuthLinks = 'true';
  links.setAttribute('aria-label', 'Account navigation');

  links.innerHTML = `
    <a href="login.html">Log in</a>
    <a class="signup" href="register.html">Create account</a>
  `;

  Object.assign(links.style, {
    position: 'fixed',
    top: '18px',
    right: '22px',
    zIndex: '20',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '7px',
    border: '1px solid rgba(13,20,32,.12)',
    borderRadius: '999px',
    background: 'rgba(255,253,248,.92)',
    boxShadow: '0 8px 24px rgba(13,20,32,.08)',
    font: '600 12px Inter, sans-serif'
  });

  links.querySelectorAll('a').forEach(link => {
    Object.assign(link.style, {
      color: '#229175',
      textDecoration: 'none',
      padding: '5px 7px'
    });
  });

  Object.assign(links.querySelector('.signup').style, {
    borderRadius: '999px',
    background: '#E4A445',
    color: '#0D1420',
    padding: '8px 11px'
  });

  document.body.appendChild(links);
})();
