const t = sigma.i18n.extensionT;
export async function activate(context) {
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
    sigma.sidebar.registerPage(page);
    const fullPageId = `${context.extensionId}.${pageId}`;
    sigma.commands.registerCommand({
        id: 'openPage',
        title: t('openPage'),
        description: t('openPageDescription'),
        shortcut: 'Ctrl+Shift+E',
    }, async () => {
        await sigma.commands.executeCommand('sigma.app.openExtensionPage', fullPageId);
    });
}
export function deactivate() { }
