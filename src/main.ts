import './ui/styles.css';
import { App } from './ui/app';
import { installTestHook } from './ui/testHook';

const host = document.getElementById('app');
if (host) {
  const app = new App(host);
  installTestHook(app);
  app.start();
}
