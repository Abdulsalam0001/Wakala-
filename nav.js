(() => {
  const nav = document.getElementById("site-nav");
  const openButton = document.getElementById("mobile-menu-open");
  const closeButton = document.getElementById("mobile-menu-close");
  const panel = document.getElementById("mobile-panel");

  if (!nav || !panel) return;

  const setOpen = (open) => {
    panel.classList.toggle("open", open);
    panel.setAttribute("aria-hidden", String(!open));
    if (openButton) openButton.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("nav-menu-open", open);
  };

  const updateScroll = () => nav.classList.toggle("scrolled", window.scrollY > 25);

  updateScroll();
  window.addEventListener("scroll", updateScroll, { passive: true });

  openButton?.addEventListener("click", () => setOpen(true));
  closeButton?.addEventListener("click", () => setOpen(false));

  panel.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setOpen(false));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 850) setOpen(false);
  });
})();
