(() => {
  'use strict';

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

  function setBusy(el, busy, label) {
    if (!el) return;
    if (busy) {
      if (!el.dataset.matosOriginalHtml) el.dataset.matosOriginalHtml = el.innerHTML;
      el.classList.add('is-loading');
      el.setAttribute('aria-busy', 'true');
      if ('disabled' in el) el.disabled = true;
      if (label) el.innerHTML = `<span class="matos-loading-label"><span class="matos-loading-dot"></span>${label}</span>`;
    } else {
      el.classList.remove('is-loading');
      el.removeAttribute('aria-busy');
      if ('disabled' in el) el.disabled = false;
      if (el.dataset.matosOriginalHtml) {
        el.innerHTML = el.dataset.matosOriginalHtml;
        delete el.dataset.matosOriginalHtml;
      }
    }
  }

  function skeletonize(container, selectors = ['.card', '.panel', 'tbody tr', '.stat-card']) {
    if (!container) return () => {};
    const nodes = selectors.flatMap(s => Array.from(container.querySelectorAll(s)));
    nodes.forEach(n => n.classList.add('matos-skeleton'));
    return () => nodes.forEach(n => n.classList.remove('matos-skeleton'));
  }

  function createProgress() {
    const bar = document.createElement('div');
    bar.className = 'matos-progress-indeterminate';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', 'Carregando');
    return bar;
  }

  function enhanceAsyncButtons(root = document) {
    root.querySelectorAll('button').forEach(btn => {
      if (btn.dataset.matosMotionReady) return;
      btn.dataset.matosMotionReady = '1';
      btn.addEventListener('keydown', e => {
        /* Interações por teclado permanecem instantâneas. */
        if ((e.key === 'Enter' || e.key === ' ') && !reduceMotion?.matches) btn.style.transform = 'none';
      });
    });
  }

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        enhanceAsyncButtons(node);
      });
    }
  });

  function init() {
    enhanceAsyncButtons();
    observer.observe(document.body, { childList: true, subtree: true });
  }

  window.MatosMotion = { setBusy, skeletonize, createProgress };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
