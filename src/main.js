import { app, BrowserWindow, ipcMain, dialog, protocol, net, nativeImage, systemPreferences, session, Menu, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import url from 'node:url';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import Store from 'electron-store';
import started from 'electron-squirrel-startup';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

app.setName('MirroSpeak');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true
    }
  },
  {
    scheme: 'thumbnail',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      bypassCSP: true
    }
  }
]);

const store = new Store();
const saveDirectoryAccessKey = 'saveDirectoryAccess';
let mainWindow;

const normalizeDirectoryAccess = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return {
      path: value,
      bookmark: '',
    };
  }

  if (typeof value.path !== 'string' || value.path.length === 0) {
    return null;
  }

  return {
    path: value.path,
    bookmark: typeof value.bookmark === 'string' ? value.bookmark : '',
  };
};

const getStoredDirectoryAccess = () => normalizeDirectoryAccess(store.get(saveDirectoryAccessKey));

const getDirectoryAccessForPath = (targetPath) => {
  const directoryAccess = getStoredDirectoryAccess();
  if (!directoryAccess) {
    return null;
  }

  const resolvedTargetPath = path.resolve(targetPath);
  const resolvedDirectoryPath = path.resolve(directoryAccess.path);
  if (
    resolvedTargetPath !== resolvedDirectoryPath &&
    !resolvedTargetPath.startsWith(`${resolvedDirectoryPath}${path.sep}`)
  ) {
    return null;
  }

  return directoryAccess;
};

const startScopedAccess = (bookmark) => {
  if (!process.mas || !bookmark) {
    return () => {};
  }

  try {
    return app.startAccessingSecurityScopedResource(bookmark);
  } catch (error) {
    console.error('Failed to start security scoped access:', error);
    return () => {};
  }
};

const withDirectoryAccess = async (targetPath, operation) => {
  const directoryAccess = getDirectoryAccessForPath(targetPath);
  const stopAccess = startScopedAccess(directoryAccess?.bookmark);

  try {
    return await operation();
  } finally {
    stopAccess();
  }
};

const resolveMacIconPath = () => {
  const appPath = app.getAppPath();
  const candidates = [
    path.join(appPath, 'assets', 'icons', 'icon.png'),
    path.join(appPath, 'src', 'icon.png'),
    path.join(process.cwd(), 'assets', 'icons', 'icon.png'),
    path.join(process.cwd(), 'src', 'icon.png'),
  ];

  return candidates.find(candidate => fs.existsSync(candidate));
};

const setMacAppIcon = () => {
  if (process.platform !== 'darwin' || !app.dock) {
    return;
  }

  const iconPath = resolveMacIconPath();
  if (!iconPath) {
    console.warn('Custom app icon not found for macOS Dock.');
    return;
  }

  const icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    console.warn(`Failed to load macOS Dock icon from ${iconPath}.`);
    return;
  }

  app.dock.setIcon(icon);
};

const createWindow = () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  mainWindow.on('closed', () => {
    mainWindow = undefined;
  });

  // Open the DevTools.
  // mainWindow.webContents.openDevTools();

  return mainWindow;
};

const showMainWindow = () => {
  createWindow();
};

const createApplicationMenu = () => {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'Window',
      role: 'windowMenu',
      submenu: [
        {
          label: 'Open MirroSpeak',
          accelerator: 'CmdOrCtrl+1',
          click: showMainWindow,
        },
        { type: 'separator' },
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'front' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

const createMacDockMenu = () => {
  if (process.platform !== 'darwin' || !app.dock) {
    return;
  }

  app.dock.setMenu(Menu.buildFromTemplate([
    {
      label: 'Open MirroSpeak',
      click: showMainWindow,
    },
  ]));
};

// IPC Handlers
ipcMain.handle('dialog:openDirectory', async () => {
  const { canceled, filePaths, bookmarks } = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    securityScopedBookmarks: process.mas,
  });

  if (canceled || filePaths.length === 0) {
    return null;
  }

  return {
    path: filePaths[0],
    bookmark: bookmarks?.[0] ?? '',
  };
});

ipcMain.handle('config:get', (event, key) => {
  return store.get(key);
});

ipcMain.handle('config:set', (event, key, value) => {
  store.set(key, value);
});

ipcMain.handle('video:save', async (event, { buffer, filename, directory }) => {
  try {
    const filePath = path.join(directory, filename);
    await withDirectoryAccess(filePath, async () => {
      await fs.promises.writeFile(filePath, Buffer.from(buffer));
    });
    return { success: true, filePath };
  } catch (error) {
    console.error('Failed to save video:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('video:list', async (event, directory) => {
  try {
    return await withDirectoryAccess(directory, async () => {
      if (!fs.existsSync(directory)) return [];
      const files = await fs.promises.readdir(directory);
      const videoFiles = files.filter(file => {
        // Filter out hidden files (starting with . or ._) and only include video files
        if (file.startsWith('.') || file.startsWith('._')) return false;
        return file.endsWith('.webm') || file.endsWith('.mp4');
      });

      const videos = await Promise.all(videoFiles.map(async (file) => {
          const filePath = path.join(directory, file);
          const stats = await fs.promises.stat(filePath);
          return {
              name: file,
              path: filePath,
              createdAt: stats.birthtime,
              size: stats.size
          };
      }));

      return videos.sort((a, b) => b.createdAt - a.createdAt);
    });
  } catch (error) {
    console.error('Failed to list videos:', error);
    return [];
  }
});

ipcMain.handle('video:rename', async (event, { filePath, newName }) => {
  try {
    if (typeof filePath !== 'string' || typeof newName !== 'string') {
      throw new Error('Invalid rename request.');
    }

    const directoryAccess = getDirectoryAccessForPath(filePath);
    if (!directoryAccess) {
      throw new Error('The video is outside the selected save directory.');
    }

    const trimmedName = newName.trim();
    if (!trimmedName || trimmedName === '.' || trimmedName === '..') {
      throw new Error('Video name cannot be empty.');
    }
    if (path.basename(trimmedName) !== trimmedName || trimmedName.startsWith('.')) {
      throw new Error('Video name contains invalid characters.');
    }

    const sourcePath = path.resolve(filePath);
    const extension = path.extname(sourcePath);
    if (!['.webm', '.mp4'].includes(extension.toLowerCase())) {
      throw new Error('Only video files can be renamed.');
    }

    const requestedExtension = path.extname(trimmedName);
    const nameWithoutExtension = ['.webm', '.mp4'].includes(requestedExtension.toLowerCase())
      ? trimmedName.slice(0, -requestedExtension.length)
      : trimmedName;
    if (!nameWithoutExtension.trim()) {
      throw new Error('Video name cannot be empty.');
    }

    const targetPath = path.join(path.dirname(sourcePath), `${nameWithoutExtension}${extension}`);
    if (!getDirectoryAccessForPath(targetPath)) {
      throw new Error('The new video path is outside the selected save directory.');
    }

    return await withDirectoryAccess(sourcePath, async () => {
      if (sourcePath === targetPath) {
        return { success: true, filePath: sourcePath, name: path.basename(sourcePath) };
      }

      try {
        const [sourceStats, targetStats] = await Promise.all([
          fs.promises.stat(sourcePath),
          fs.promises.stat(targetPath),
        ]);
        if (!sourceStats.isFile()) {
          throw new Error('The selected path is not a video file.');
        }
        if (sourceStats.dev !== targetStats.dev || sourceStats.ino !== targetStats.ino) {
          throw new Error('A video with this name already exists.');
        }
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }

        const sourceStats = await fs.promises.stat(sourcePath);
        if (!sourceStats.isFile()) {
          throw new Error('The selected path is not a video file.');
        }
      }

      await fs.promises.rename(sourcePath, targetPath);
      return { success: true, filePath: targetPath, name: path.basename(targetPath) };
    });
  } catch (error) {
    console.error('Failed to rename video:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('video:delete', async (event, { filePath }) => {
  try {
    if (typeof filePath !== 'string') {
      throw new Error('Invalid delete request.');
    }

    const sourcePath = path.resolve(filePath);
    if (!getDirectoryAccessForPath(sourcePath)) {
      throw new Error('The video is outside the selected save directory.');
    }
    if (!['.webm', '.mp4'].includes(path.extname(sourcePath).toLowerCase())) {
      throw new Error('Only video files can be deleted.');
    }

    await withDirectoryAccess(sourcePath, async () => {
      const stats = await fs.promises.stat(sourcePath);
      if (!stats.isFile()) {
        throw new Error('The selected path is not a video file.');
      }
      await shell.trashItem(sourcePath);
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to move video to Trash:', error);
    return { success: false, error: error.message };
  }
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  setMacAppIcon();
  createApplicationMenu();
  createMacDockMenu();

  // 工业级 CORS 解决方案：拦截并修改响应头
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Access-Control-Allow-Origin': ['*'],
        'Access-Control-Allow-Methods': ['GET, POST, OPTIONS, PUT, PATCH, DELETE'],
        'Access-Control-Allow-Headers': ['X-Requested-With, content-type, Authorization'],
      }
    });
  });

  // Request camera and microphone permissions on macOS
  if (process.platform === 'darwin') {
    // 延迟一点点请求权限，确保窗口或进程完全准备好
    setTimeout(async () => {
      try {
        await systemPreferences.askForMediaAccess('camera');
        await systemPreferences.askForMediaAccess('microphone');
      } catch (err) {
        console.error('Failed to request media access:', err);
      }
    }, 1000);
  }

  const thumbnailsDir = path.join(app.getPath('userData'), 'thumbnails');
  if (!fs.existsSync(thumbnailsDir)) {
    fs.mkdirSync(thumbnailsDir, { recursive: true });
  }

  protocol.handle('thumbnail', async (request) => {
    try {
      const parsedUrl = new URL(request.url);
      const decodedPath = decodeURIComponent(parsedUrl.pathname);

      return await withDirectoryAccess(decodedPath, async () => {
        const hash = crypto.createHash('md5').update(decodedPath).digest('hex');
        const thumbPath = path.join(thumbnailsDir, `${hash}.jpg`);

        // Check if cached thumbnail exists
        try {
          await fs.promises.access(thumbPath);
          return net.fetch(url.pathToFileURL(thumbPath).toString());
        } catch {
          // Cache doesn't exist, need to generate
        }

        // Try to generate thumbnail using native method
        try {
          const image = await nativeImage.createThumbnailFromPath(decodedPath, { width: 320, height: 180 });
          if (!image.isEmpty()) {
            const buffer = image.toJPEG(80);
            await fs.promises.writeFile(thumbPath, buffer);
            return net.fetch(url.pathToFileURL(thumbPath).toString());
          }
        } catch (err) {
          console.log('Native thumbnail generation failed, will use fallback:', err.message);
        }

        // Fallback: Return a placeholder image for webm and unsupported formats
        const ext = path.extname(decodedPath).toLowerCase();
        if (ext === '.webm') {
          // For webm, create a simple placeholder with file name
          const placeholderSvg = `<svg width="320" height="180" xmlns="http://www.w3.org/2000/svg">
            <rect width="320" height="180" fill="#1a1a1a"/>
            <text x="160" y="80" font-family="Arial" font-size="48" fill="#ffffff" text-anchor="middle">WebM</text>
            <text x="160" y="110" font-family="Arial" font-size="14" fill="#888888" text-anchor="middle">${path.basename(decodedPath)}</text>
          </svg>`;

          return new Response(placeholderSvg, {
            headers: {
              'Content-Type': 'image/svg+xml',
            }
          });
        }

        // Generic fallback
        return new Response('Error generating thumbnail', { status: 500 });
      });
    } catch (error) {
      console.error('Failed to generate thumbnail:', error);
      return new Response('Error generating thumbnail', { status: 500 });
    }
  });

  protocol.handle('media', async (request) => {
    let filePath;
    try {
      const parsedUrl = new URL(request.url);
      // For standard scheme, the absolute path will start from pathname
      filePath = decodeURIComponent(parsedUrl.pathname);
    } catch (error) {
      // Fallback for non-standard URLs if any
      filePath = decodeURIComponent(request.url.slice('media://'.length));
    }

    try {
      return await withDirectoryAccess(filePath, async () => {
        const stats = await fs.promises.stat(filePath);
        const fileSize = stats.size;
        const fileExt = path.extname(filePath).toLowerCase();
        const mimeType = fileExt === '.webm' ? 'video/webm' : 'video/mp4';

        const range = request.headers.get('Range');

        if (range) {
          const parts = range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
          const chunksize = (end - start) + 1;

          const fileStream = fs.createReadStream(filePath, { start, end });
          // Convert Node stream to Web stream for Response
          const readableWebStream = Readable.toWeb(fileStream);

          return new Response(readableWebStream, {
            status: 206,
            headers: {
              'Content-Range': `bytes ${start}-${end}/${fileSize}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': chunksize,
              'Content-Type': mimeType
            }
          });
        }

        const fileStream = fs.createReadStream(filePath);
        const readableWebStream = Readable.toWeb(fileStream);

        return new Response(readableWebStream, {
          status: 200,
          headers: {
            'Content-Length': fileSize,
            'Content-Type': mimeType
          }
        });
      });
    } catch (error) {
      console.error('Media protocol error:', error);
      return new Response('File not found or access denied', { status: 404 });
    }
  });

  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
