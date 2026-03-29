import React from 'react';
import { createRoot } from 'react-dom/client';
import { Excalidraw } from '@excalidraw/excalidraw';
import excalidrawCssText from './generated/excalidraw-css.js';

const STORAGE_KEY = 'excalidraw-data';
const SAVE_DEBOUNCE_MS = 500;
const EXCALIDRAW_WEBSITE_URL = 'https://github.com/excalidraw/excalidraw';

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

function waitForFrame() {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

async function waitForContainerLayout(container) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { width, height } = container.getBoundingClientRect();
    if (width > 0 && height > 0) {
      return;
    }
    await waitForFrame();
  }
}

function dispatchResize() {
  globalThis.dispatchEvent(new Event('resize'));
}

function ensureStyles() {
  const existingStyle = document.getElementById('sigma-excalidraw-styles');
  if (existingStyle) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'sigma-excalidraw-styles';
  style.textContent = excalidrawCssText;
  document.head.appendChild(style);
}

function ensureProcess() {
  if (typeof globalThis.process === 'undefined') {
    globalThis.process = { env: {} };
  }
}

export async function mount(container, context = {}) {
  ensureProcess();
  ensureStyles();

  container.style.width = '100%';
  container.style.height = '100%';
  container.style.minWidth = '0';
  container.style.minHeight = '0';
  container.style.display = 'flex';

  await waitForContainerLayout(container);

  const sigma = context.sigma;
  const toolbarContainer = context.toolbarContainer;
  const t = key => sigma?.i18n?.extensionT?.(key) ?? key;

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
    }
    catch {
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
        for (const [fileId, fileData] of Object.entries(files)) {
          if (fileData && typeof fileData === 'object' && fileData.dataURL) {
            serializableFiles[fileId] = { mimeType: fileData.mimeType, dataURL: fileData.dataURL };
          }
        }
        if (Object.keys(serializableFiles).length > 0) payload.files = serializableFiles;
      }
      sigma.storage.set(STORAGE_KEY, payload);
    }
    catch (error) {
      console.error('Excalidraw save failed:', error);
    }
  };

  const saveToStorage = debounce(() => {
    if (latestSceneData) persistToStorage(...Object.values(latestSceneData));
  }, SAVE_DEBOUNCE_MS);

  function ExcalidrawApp() {
    const [initialData, setInitialData] = React.useState(null);

    React.useEffect(() => {
      initialDataPromise.then(setInitialData);
    }, []);

    const handleChange = (elements, appState, files) => {
      latestSceneData = { elements, appState, files };
      saveToStorage();
    };

    if (initialData === null) {
      return React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          color: 'var(--color-text-secondary)',
        },
      }, t('loading'));
    }

    return React.createElement('div', {
      style: {
        width: '100%',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
        display: 'flex',
      },
    }, React.createElement(Excalidraw, {
      zenModeEnabled: false,
      gridModeEnabled: false,
      viewModeEnabled: false,
      langCode: 'en-US',
      initialData,
      onChange: handleChange,
      uiOptions: {
        canvasActions: {
          export: { saveFileToDisk: true },
        },
      },
    }));
  }

  const root = createRoot(container);
  root.render(React.createElement(ExcalidrawApp));

  const resizeObserver = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => {
      dispatchResize();
    })
    : null;

  resizeObserver?.observe(container);
  dispatchResize();
  setTimeout(dispatchResize, 0);
  requestAnimationFrame(() => {
    dispatchResize();
  });

  return () => {
    if (latestSceneData) {
      const { elements, appState, files } = latestSceneData;
      persistToStorage(elements, appState, files);
    }
    root.unmount();
    resizeObserver?.disconnect();
    if (toolbarHandle?.unmount) {
      toolbarHandle.unmount();
    }
  };
}
