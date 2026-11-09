import './style.css';
import { createApp } from './app.js';

createApp(document.querySelector('#app'));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const sw = `${import.meta.env.BASE_URL}sw.js`;
    navigator.serviceWorker.register(sw).catch(() => {});
  });
}
