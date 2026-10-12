import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';

/**
 * Renders a React node into #print-root, opens the browser print dialog,
 * then cleans up. Any images inside must already be loaded/data URLs.
 */
export function printNode(node) {
  const host = document.getElementById('print-root');
  const root = createRoot(host);
  flushSync(() => root.render(node));
  document.body.classList.add('printing');

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    window.removeEventListener('afterprint', cleanup);
    document.body.classList.remove('printing');
    root.unmount();
  };
  window.addEventListener('afterprint', cleanup);

  const imgs = [...host.querySelectorAll('img')];
  Promise.all(
    imgs.map((img) => (img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r; }))),
  ).then(() => {
    setTimeout(() => {
      window.print();
      // Fallback for browsers that never fire afterprint
      setTimeout(cleanup, 60000);
    }, 150);
  });
}
