// @ts-check
import { getStudioProApi } from '@mendix/extensions-api';
import css from '../toolbox/styles.css';
import { mountToolbox } from '../toolbox/app.js';

/**
 * Shared by the tab and pane entry points: styles the host page and starts the toolbox in #root.
 * @param {import('@mendix/extensions-api').ComponentContext} componentContext
 */
export async function mount(componentContext) {
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));
  const studioPro = getStudioProApi(componentContext);
  let hostTheme = null;
  try {
    const { theme } = await studioPro.ui.preferences.getPreferences();
    hostTheme = theme === 'Dark' ? 'dark' : theme === 'Light' ? 'light' : null;
  } catch {
    // Older Studio Pro or no preferences API: fall back to the OS theme.
  }
  mountToolbox(document.getElementById('root') ?? document.body, { hostTheme, studioPro });
}
