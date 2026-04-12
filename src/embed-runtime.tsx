import type {
  AppState,
  BinaryFileData,
  ExcalidrawInitialDataState,
  ExcalidrawProps,
} from '@excalidraw/excalidraw/types';
import type { SigmaExtensionAPI, ToolbarRenderHandle } from '@sigma-file-manager/api';
import { Excalidraw } from '@excalidraw/excalidraw';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import excalidrawCssText from './generated/excalidraw-css.js';

const STORAGE_KEY = 'excalidraw-data';
const SAVE_DEBOUNCE_MS = 500;
const EXCALIDRAW_WEBSITE_URL = 'https://github.com/excalidraw/excalidraw';

type LocaleKey = 'title' | 'openWebsite' | 'loading';

export interface EmbedMountContext {
  sigma?: SigmaExtensionAPI;
  toolbarContainer?: HTMLElement;
}

function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delay: number,
): (...args: TArgs) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return (...args: TArgs) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = null;
      fn(...args);
    }, delay);
  };
}

function waitForFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitForContainerLayout(container: HTMLElement): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { width, height } = container.getBoundingClientRect();
    if (width > 0 && height > 0) {
      return;
    }
    await waitForFrame();
  }
}

function dispatchResize(): void {
  globalThis.dispatchEvent(new Event('resize'));
}

function ensureStyles(): void {
  const existingStyle = document.getElementById('sigma-excalidraw-styles');
  if (existingStyle) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'sigma-excalidraw-styles';
  style.textContent = excalidrawCssText;
  document.head.appendChild(style);
}

function ensureProcess(): void {
  const globals = globalThis as typeof globalThis & {
    process?: { env: Record<string, string | undefined> };
  };
  if (typeof globals.process === 'undefined') {
    globals.process = { env: {} };
  }
}

type OnChangeCallback = NonNullable<ExcalidrawProps['onChange']>;
type SceneSnapshot = {
  elements: Parameters<OnChangeCallback>[0];
  appState: Parameters<OnChangeCallback>[1];
  files: Parameters<OnChangeCallback>[2];
};

type StoredScenePayload = {
  elements?: unknown;
  appState?: unknown;
  files?: unknown;
};

export async function mount(
  container: HTMLElement,
  context: EmbedMountContext = {},
): Promise<() => void> {
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
  const translate = (key: LocaleKey) => sigma?.i18n?.extensionT?.(key) ?? key;

  let toolbarHandle: ToolbarRenderHandle | null = null;
  if (sigma?.ui?.renderToolbar && toolbarContainer) {
    const toolbarElements = [
      sigma.ui.text(translate('title')),
      sigma.ui.button({ id: 'open-website', label: translate('openWebsite'), size: 'xs' }),
    ];
    toolbarHandle = sigma.ui.renderToolbar(toolbarContainer, toolbarElements, async (buttonId) => {
      if (buttonId === 'open-website' && sigma.context?.openUrl) {
        await sigma.context.openUrl(EXCALIDRAW_WEBSITE_URL);
      }
    });
  }

  const defaultInitialData: ExcalidrawInitialDataState = {
    appState: { theme: 'dark', plugins: {} } as unknown as AppState,
  };
  function sanitizeAppState(appState: unknown): AppState {
    if (!appState || typeof appState !== 'object') {
      return defaultInitialData.appState as unknown as AppState;
    }
    const sanitized = {
      theme: 'dark' as const,
      plugins: {},
      ...(appState as Record<string, unknown>),
    } as unknown as AppState;
    if (!Array.isArray(sanitized.collaborators) && !(sanitized.collaborators instanceof Map)) {
      delete (sanitized as Partial<AppState>).collaborators;
    }
    return sanitized;
  }

  const initialDataPromise = (async () => {
    if (!sigma?.storage?.get) return defaultInitialData;
    try {
      const saved = await sigma.storage.get<StoredScenePayload>(STORAGE_KEY);
      if (!saved || typeof saved !== 'object') return defaultInitialData;
      return {
        elements: Array.isArray(saved.elements) ? saved.elements : null,
        appState: sanitizeAppState(saved.appState),
        files: saved.files && typeof saved.files === 'object' ? (saved.files as Parameters<OnChangeCallback>[2]) : null,
      };
    }
    catch {
      return defaultInitialData;
    }
  })();

  let latestSceneData: SceneSnapshot | null = null;
  const persistToStorage = (
    elements: Parameters<OnChangeCallback>[0],
    appState: Parameters<OnChangeCallback>[1],
    files: Parameters<OnChangeCallback>[2],
  ) => {
    if (!sigma?.storage?.set) return;
    try {
      const appStateToSave = appState && typeof appState === 'object' ? { ...appState } : {};
      delete (appStateToSave as Partial<AppState>).collaborators;
      const payload: StoredScenePayload = { elements, appState: appStateToSave };
      if (files && Object.keys(files).length > 0) {
        const serializableFiles: Parameters<OnChangeCallback>[2] = {};
        for (const [fileId, fileData] of Object.entries(files)) {
          if (fileData && typeof fileData === 'object' && fileData.dataURL) {
            serializableFiles[fileId] = {
              mimeType: fileData.mimeType,
              dataURL: fileData.dataURL,
            } as BinaryFileData;
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
    if (latestSceneData) persistToStorage(latestSceneData.elements, latestSceneData.appState, latestSceneData.files);
  }, SAVE_DEBOUNCE_MS);

  function ExcalidrawApp() {
    const [initialData, setInitialData] = useState<Awaited<typeof initialDataPromise> | null>(null);

    useEffect(() => {
      initialDataPromise.then(setInitialData);
    }, []);

    const handleChange: OnChangeCallback = (elements, appState, files) => {
      latestSceneData = { elements, appState, files };
      saveToStorage();
    };

    if (initialData === null) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            color: 'var(--color-text-secondary)',
          }}
        >
          {translate('loading')}
        </div>
      );
    }

    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
        }}
      >
        <Excalidraw
          zenModeEnabled={false}
          gridModeEnabled={false}
          viewModeEnabled={false}
          langCode="en-US"
          initialData={initialData}
          onChange={handleChange}
          uiOptions={{
            canvasActions: {
              export: { saveFileToDisk: true },
            },
          }}
        />
      </div>
    );
  }

  const root = createRoot(container);
  root.render(<ExcalidrawApp />);

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
