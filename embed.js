const EXCALIDRAW_VERSION = '0.18.0';
const REACT_VERSION = '19.0.0';
const EXCALIDRAW_WEBSITE_URL = 'https://github.com/excalidraw/excalidraw';
const STORAGE_KEY = 'excalidraw-data';
const SAVE_DEBOUNCE_MS = 500;

const EXCALIDRAW_BASE = `https://cdn.jsdelivr.net/npm/@excalidraw/excalidraw@${EXCALIDRAW_VERSION}`;

function debounce(fn, delay) {
  let timeoutId = null;
  return (...args) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = null;
      fn(...args);
    }, delay);
  };
}

export async function mount(container, context = {}) {
  container.style.width = '100%';
  container.style.height = '100%';
  container.style.minWidth = '0';
  container.style.minHeight = '0';
  container.style.display = 'flex';

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `${EXCALIDRAW_BASE}/dist/prod/index.css`;
  document.head.appendChild(link);

  const assetScript = document.createElement('script');
  assetScript.textContent = `
    window.EXCALIDRAW_ASSET_PATH = "${EXCALIDRAW_BASE}/dist/prod/";
    window.process = window.process || { env: {} };
  `;
  document.head.appendChild(assetScript);

  const excalidrawImports = {
    'react': `https://esm.sh/react@${REACT_VERSION}`,
    'react/jsx-runtime': `https://esm.sh/react@${REACT_VERSION}/jsx-runtime`,
    'react-dom': `https://esm.sh/react-dom@${REACT_VERSION}`,
    'react-dom/client': `https://esm.sh/react-dom@${REACT_VERSION}/client`,
  };
  const existingImportMap = document.querySelector('script[type="importmap"]');
  if (existingImportMap) {
    try {
      const parsed = JSON.parse(existingImportMap.textContent || '{}');
      existingImportMap.textContent = JSON.stringify({
        ...parsed,
        imports: { ...parsed.imports, ...excalidrawImports },
      });
    } catch {
    }
  } else {
    const importMap = document.createElement('script');
    importMap.type = 'importmap';
    importMap.textContent = JSON.stringify({ imports: excalidrawImports });
    document.head.appendChild(importMap);
  }

  const [ReactModule, ReactDOMClientModule, ExcalidrawModule] = await Promise.all([
    import(`https://esm.sh/react@${REACT_VERSION}`),
    import(`https://esm.sh/react-dom@${REACT_VERSION}/client`),
    import(`https://esm.sh/@excalidraw/excalidraw@${EXCALIDRAW_VERSION}/dist/prod/index.js?external=react,react-dom`),
  ]);

  const React = ReactModule.default;
  const { createRoot } = ReactDOMClientModule;
  const ExcalidrawLib = ExcalidrawModule;
  const { exportToBlob, exportToSvg } = ExcalidrawLib;

  const sigma = context.sigma;
  const toolbarContainer = context.toolbarContainer;

  const t = (key) => sigma?.i18n?.extensionT?.(key) ?? key;
  let toolbarHandle = null;
  if (sigma?.ui?.renderToolbar && toolbarContainer) {
    const toolbarElements = [
      sigma.ui.text(t('title')),
      sigma.ui.button({ id: 'open-website', label: t('openWebsite'), size: 'xs' }),
    ];
    toolbarHandle = sigma.ui.renderToolbar(toolbarContainer, toolbarElements, async (buttonId) => {
      if (buttonId === 'open-website' && sigma.context?.openUrl) {
        await sigma.context.openUrl(EXCALIDRAW_WEBSITE_URL);
      }
    });
  }

  function ExportToFolderButtons({ excalidrawAPI }) {
    const handleExportPng = React.useCallback(async () => {
      if (!sigma?.dialog?.saveFile || !sigma?.fs?.writeFile || !excalidrawAPI) return;
      try {
        const elements = excalidrawAPI.getSceneElements();
        const appState = excalidrawAPI.getAppState();
        const files = excalidrawAPI.getFiles();
        const blob = await exportToBlob({
          elements,
          appState: { ...appState, exportBackground: true },
          files,
          mimeType: 'image/png',
        });
        const path = await sigma.dialog.saveFile({
          filters: [{ name: t('pngImage'), extensions: ['png'] }],
          defaultPath: 'drawing.png',
        });
        if (path) {
          const buffer = await blob.arrayBuffer();
          await sigma.fs.writeFile(path, new Uint8Array(buffer));
        }
      } catch (error) {
        console.error('Export PNG failed:', error);
      }
    }, [sigma, excalidrawAPI]);

    const handleExportSvg = React.useCallback(async () => {
      if (!sigma?.dialog?.saveFile || !sigma?.fs?.writeFile || !excalidrawAPI) return;
      try {
        const elements = excalidrawAPI.getSceneElements();
        const appState = excalidrawAPI.getAppState();
        const files = excalidrawAPI.getFiles();
        const svg = await exportToSvg({
          elements,
          appState: { ...appState, exportBackground: true },
          files,
        });
        const path = await sigma.dialog.saveFile({
          filters: [{ name: t('svgImage'), extensions: ['svg'] }],
          defaultPath: 'drawing.svg',
        });
        if (path) {
          const encoder = new TextEncoder();
          await sigma.fs.writeFile(path, encoder.encode(svg.outerHTML));
        }
      } catch (error) {
        console.error('Export SVG failed:', error);
      }
    }, [sigma, excalidrawAPI]);

    return React.createElement('div', { style: { display: 'flex', gap: '8px', marginTop: '8px' } },
      React.createElement('button', {
        type: 'button',
        onClick: handleExportPng,
        disabled: !excalidrawAPI,
        style: { padding: '6px 12px', cursor: excalidrawAPI ? 'pointer' : 'not-allowed' },
      }, t('exportPng')),
      React.createElement('button', {
        type: 'button',
        onClick: handleExportSvg,
        disabled: !excalidrawAPI,
        style: { padding: '6px 12px', cursor: excalidrawAPI ? 'pointer' : 'not-allowed' },
      }, t('exportSvg')),
    );
  }

  const defaultInitialData = { appState: { theme: 'dark', plugins: {} } };
  function sanitizeAppState(appState) {
    if (!appState || typeof appState !== 'object') return defaultInitialData.appState;
    const sanitized = { theme: 'dark', plugins: {}, ...appState };
    if (!Array.isArray(sanitized.collaborators) && !(sanitized.collaborators instanceof Map)) {
      delete sanitized.collaborators;
    }
    return sanitized;
  }
  const initialDataPromise = (async () => {
    if (!sigma?.storage?.get) return defaultInitialData;
    try {
      const saved = await sigma.storage.get(STORAGE_KEY);
      if (!saved || typeof saved !== 'object') return defaultInitialData;
      return {
        elements: Array.isArray(saved.elements) ? saved.elements : null,
        appState: sanitizeAppState(saved.appState),
        files: saved.files && typeof saved.files === 'object' ? saved.files : null,
      };
    } catch {
      return defaultInitialData;
    }
  })();

  let latestSceneData = null;
  const persistToStorage = (elements, appState, files) => {
    if (!sigma?.storage?.set) return;
    try {
      const appStateToSave = appState && typeof appState === 'object' ? { ...appState } : {};
      delete appStateToSave.collaborators;
      const payload = { elements, appState: appStateToSave };
      if (files && Object.keys(files).length > 0) {
        const serializableFiles = {};
        for (const [id, fileData] of Object.entries(files)) {
          if (fileData && typeof fileData === 'object' && fileData.dataURL) {
            serializableFiles[id] = { mimeType: fileData.mimeType, dataURL: fileData.dataURL };
          }
        }
        if (Object.keys(serializableFiles).length > 0) payload.files = serializableFiles;
      }
      sigma.storage.set(STORAGE_KEY, payload);
    } catch (error) {
      console.error('Excalidraw save failed:', error);
    }
  };
  const saveToStorage = debounce(() => {
    if (latestSceneData) persistToStorage(...Object.values(latestSceneData));
  }, SAVE_DEBOUNCE_MS);

  function ExcalidrawWithExport() {
    const [excalidrawAPI, setExcalidrawAPI] = React.useState(null);
    const [initialData, setInitialData] = React.useState(null);

    React.useEffect(() => {
      initialDataPromise.then(setInitialData);
    }, []);

    const handleChange = (elements, appState, files) => {
      latestSceneData = { elements, appState, files };
      saveToStorage();
    };

    const exportOpts = sigma ? {
      saveFileToDisk: true,
      renderCustomUI: () => React.createElement(ExportToFolderButtons, { excalidrawAPI }),
    } : { saveFileToDisk: true };

    if (initialData === null) {
      const loaderText = sigma?.i18n?.extensionT?.('loading') ?? 'Loading...';
      return React.createElement('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-secondary)' },
      }, loaderText);
    }

    const handleExcalidrawAPI = (api) => {
      setExcalidrawAPI(api);
    };

    return React.createElement('div', {
      style: {
        width: '100%',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
        display: 'flex',
      },
    }, React.createElement(ExcalidrawLib.Excalidraw, {
      zenModeEnabled: false,
      gridModeEnabled: false,
      viewModeEnabled: false,
      langCode: 'en-US',
      initialData,
      onChange: handleChange,
      excalidrawAPI: handleExcalidrawAPI,
      uiOptions: {
        canvasActions: {
          export: exportOpts,
        },
      },
    }));
  }

  const unmount = () => {
    if (latestSceneData) {
      const { elements, appState, files } = latestSceneData;
      persistToStorage(elements, appState, files);
    }
    root.unmount();
    if (toolbarHandle?.unmount) {
      toolbarHandle.unmount();
    }
    link.remove();
    assetScript.remove();
  };

  const root = createRoot(container);
  root.render(React.createElement(ExcalidrawWithExport));

  return unmount;
}
