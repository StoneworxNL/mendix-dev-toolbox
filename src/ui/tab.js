import { mount } from './mount.js';

export const component = {
  async loaded(componentContext) {
    await mount(componentContext);
  },
};
