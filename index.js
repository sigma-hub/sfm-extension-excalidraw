// @ts-check

/**
 * @typedef {import('@sigma-file-manager/api').ExtensionActivationContext} ExtensionActivationContext
 */

/**
 * @param {ExtensionActivationContext} context
 */
export async function activate(context) {
  await sigma.i18n.mergeFromPath('locales');
  sigma.sidebar.registerPage({
    id: 'excalidraw',
    title: 'Excalidraw',
    icon: 'PencilRuler',
    url: 'dist/embed.js',
    order: 1,
  });
}

export function deactivate() {}
