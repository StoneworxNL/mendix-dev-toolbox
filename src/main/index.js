// @ts-check
import { getStudioProApi } from '@mendix/extensions-api';

// Must match the folder name the extension is deployed to (<app>/extensions/devtoolbox).
const COMPONENT = 'extension/devtoolbox';
const TITLE = 'Developer Toolbox';

/** @type {import('@mendix/extensions-api').IComponent} */
export const component = {
  async loaded(componentContext) {
    if (componentContext.runMode === 'headless') return;
    const studioPro = getStudioProApi(componentContext);
    const pane = await studioPro.ui.panes.register(
      { title: TITLE, initialPosition: 'right' },
      { componentName: COMPONENT, uiEntrypoint: 'pane' },
    );
    await studioPro.ui.extensionsMenu.add({
      menuId: 'devtoolbox.menu',
      caption: TITLE,
      subMenus: [
        {
          menuId: 'devtoolbox.openTab',
          caption: 'Open in a tab',
          action: async () => {
            await studioPro.ui.tabs.open({ title: TITLE }, { componentName: COMPONENT, uiEntrypoint: 'tab' }, { isSingleton: true });
          },
        },
        {
          menuId: 'devtoolbox.openPane',
          caption: 'Open as a docked pane',
          action: async () => { await studioPro.ui.panes.open(pane); },
        },
      ],
    });
  },
};
