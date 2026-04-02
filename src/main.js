import { app, BrowserWindow, ipcMain, dialog, protocol, net, nativeImage, systemPreferences, session } from 'electron';
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
  // Create the browser window.
  const mainWindow = new BrowserWindow({
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

  // Open the DevTools.
  // mainWindow.webContents.openDevTools();
};

// IPC Handlers
ipcMain.handle('dialog:openDirectory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });
  if (canceled) {
    return;
  } else {
    return filePaths[0];
  }
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
    await fs.promises.writeFile(filePath, Buffer.from(buffer));
    return { success: true, filePath };
  } catch (error) {
    console.error('Failed to save video:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('video:list', async (event, directory) => {
  try {
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
  } catch (error) {
    console.error('Failed to list videos:', error);
    return [];
  }
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  setMacAppIcon();

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
      } else {
        const fileStream = fs.createReadStream(filePath);
        const readableWebStream = Readable.toWeb(fileStream);
        
        return new Response(readableWebStream, {
          status: 200,
          headers: {
            'Content-Length': fileSize,
            'Content-Type': mimeType
          }
        });
      }
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
