// @ts-check
import { getStudioProApi } from '@mendix/extensions-api';
import css from '../toolbox/styles.css';
import { mountToolbox, setHostTheme } from '../toolbox/app.js';

/**
 * Shared by the tab and pane entry points: styles the host page and starts the toolbox in #root.
 * @param {import('@mendix/extensions-api').ComponentContext} componentContext
 */
export async function mount(componentContext) {
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));
  const studioPro = getStudioProApi(componentContext);
  const readTheme = async () => {
    try {
      const { theme } = await studioPro.ui.preferences.getPreferences();
      return theme === 'Dark' ? 'dark' : theme === 'Light' ? 'light' : null;
    } catch {
      return null; // older Studio Pro or no preferences API: fall back to the OS theme
    }
  };
  mountToolbox(document.getElementById('root') ?? document.body, { hostTheme: await readTheme(), studioPro });
  // Studio Pro has no theme change event, so check again whenever the toolbox gets focus.
  const refresh = async () => setHostTheme(await readTheme());
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
}
