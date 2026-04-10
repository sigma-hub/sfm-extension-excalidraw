import type { ExtensionActivationContext } from '@sigma-file-manager/api';

const t = sigma.i18n.extensionT;

export async function activate(context: ExtensionActivationContext): Promise<void> {
  await sigma.i18n.mergeFromPath('locales');
  const pageId = 'excalidraw';
  const page = {
    id: pageId,
    title: 'Excalidraw',
    icon: 'PencilRuler',
    url: 'dist/embed.js',
    order: 1,
    shortcutCommandId: 'openPage',
  };
  sigma.sidebar.registerPage(page as Parameters<typeof sigma.sidebar.registerPage>[0]);
  const fullPageId = `${context.extensionId}.${pageId}`;
  sigma.commands.registerCommand(
    {
      id: 'openPage',
      title: t('openPage'),
      description: t('openPageDescription'),
      shortcut: 'Ctrl+Shift+E',
    },
    async () => {
      await sigma.commands.executeCommand('sigma.app.openExtensionPage', fullPageId);
    },
  );
}

export function deactivate(): void {}
