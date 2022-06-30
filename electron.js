const electron = require('electron');
const { app, BrowserWindow, ipcMain, session, nativeTheme } = require('electron');
const { is, fixPathForAsarUnpack } = require('electron-util');
const path = require('path');
const os = require('os');
const storage = require('electron-json-storage');
const fs = require('fs');
const readChunk = require('read-chunk');
const fileType = require('file-type');
const port = process.env.SERVER_PORT;
const protocol = 'anytype';
const remote = require('@electron/remote/main');

const userPath = app.getPath('userData');
const tmpPath = path.join(userPath, 'tmp');
const binPath = fixPathForAsarUnpack(path.join(__dirname, 'dist', `anytypeHelper${is.windows ? '.exe' : ''}`));

const ConfigManager = require('./electron/js/config.js');
const UpdateManager = require('./electron/js/update.js');
const MenuManager = require('./electron/js/menu.js');
const WindowManager = require('./electron/js/window.js');
const Server = require('./electron/js/server.js');
const Util = require('./electron/js/util.js');

app.removeAsDefaultProtocolClient(protocol);
Util.setAppPath(path.join(__dirname));
WindowManager.exit = exit;

if (process.defaultApp) {
	if (process.argv.length >= 2) {
		app.setAsDefaultProtocolClient(protocol, process.execPath, [ path.resolve(process.argv[1]) ]);
	};
} else {
	app.setAsDefaultProtocolClient(protocol);
};

remote.initialize();

let deeplinkingUrl = '';
let waitLibraryPromise;
let mainWindow = null;
let csp = [
	"default-src 'self' 'unsafe-eval'",
	"img-src 'self' http://*:* https://*:* data: blob: file://*",
	"media-src 'self' http://*:* https://*:* data: blob: file://*",
	"style-src 'unsafe-inline' http://localhost:* file://*",
	"font-src data: file://*",
	"connect-src http://localhost:* http://127.0.0.1:* ws://localhost:* https://sentry.anytype.io https://anytype.io https://api.amplitude.com/ devtools://devtools data: https://*.wistia.com https://*.wistia.net https://embedwistia-a.akamaihd.net",
	"script-src-elem file: http://localhost:* https://sentry.io devtools://devtools 'unsafe-inline' https://*.wistia.com https://*.wistia.net",
	"frame-src chrome-extension://react-developer-tools"
];

if (is.development && !port) {
	console.error('ERROR: Please define SERVER_PORT env var');
	exit(false);
};

if (app.isPackaged && !app.requestSingleInstanceLock()) {
	exit(false);
};

storage.setDataPath(userPath);
Util.mkDir(tmpPath);

if (process.env.ANYTYPE_USE_SIDE_SERVER) {
	// use the grpc server started from the outside
	Server.setAddress(process.env.ANYTYPE_USE_SIDE_SERVER);
	waitLibraryPromise = Promise.resolve();
} else {
	waitLibraryPromise = Server.start(binPath, userPath);
};

function waitForLibraryAndCreateWindows () {
	waitLibraryPromise.then((res) => {
		global.serverAddr = Server.getAddress();
		createMainWindow();
	}, (err) => {
		electron.dialog.showErrorBox('Error: failed to run server', err.toString());
	});
};

nativeTheme.on('updated', () => {
	MenuManager.updateTrayIcon();
	Util.send(mainWindow, 'native-theme', Util.isDarkTheme());
});

function createMainWindow () {
	mainWindow = WindowManager.createMain({ withState: true, route: Util.getRouteFromUrl(deeplinkingUrl) });

	if (process.env.ELECTRON_DEV_EXTENSIONS) {
		BrowserWindow.addDevToolsExtension(
			path.join(os.homedir(), '/Library/Application Support/Google/Chrome/Default/Extensions/fmkadmapgofadopljbjfkapdkoienihi/4.6.0_0')
		);
	};

	mainWindow.on('close', (e) => {
		Util.log('info', 'closeMain: ' + app.isQuiting);

		if (app.isQuiting) {
			return;
		};
		
		e.preventDefault();
		if (!is.linux) {
			if (win.isFullScreen()) {
				win.setFullScreen(false);
				win.once('leave-full-screen', () => { win.hide(); });
			} else {
				win.hide();
			};
		} else {
			this.exit(false);
		};
		return false;
	});

	registerIpcEvents();

	UpdateManager.init(mainWindow);
	UpdateManager.exit = exit;

	MenuManager.exit = exit;
	MenuManager.setConfig = setConfig;
	MenuManager.setChannel = (channel) => {
		if (!UpdateManager.isUpdating) {
			setConfig({ channel: channel }, (error) => { 
				UpdateManager.setChannel(channel); 
			});
		};
	};
	MenuManager.initMenu(mainWindow);
	MenuManager.initTray(mainWindow);
};

function registerIpcEvents () {
	ipcMain.on('exit', (e, relaunch) => { exit(relaunch); });
	ipcMain.on('shutdown', (e, relaunch) => { shutdown(relaunch); });
	ipcMain.on('updateConfirm', (e) => { exit(true); }); 
};

function setConfig (obj, callBack) {
	ConfigManager.set(obj, (err) => {
		Util.send(BrowserWindow.getFocusedWindow(), 'config', ConfigManager.config);

		if (callBack) {
			callBack(err);
		};
	});
};

app.on('ready', () => {
	session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
		callback({
			responseHeaders: {
				...details.responseHeaders,
				'Content-Security-Policy': [ csp.join('; ') ]
			}
		})
	});

	ConfigManager.init(waitForLibraryAndCreateWindows);
});

app.on('second-instance', (event, argv, cwd) => {
	Util.log('info', 'second-instance');

	if (!is.macos) {
		deeplinkingUrl = argv.find((arg) => arg.startsWith(`${protocol}://`));
	};

	if (mainWindow) {
		if (deeplinkingUrl) {
			Util.send(mainWindow, 'route', Util.getRouteFromUrl(deeplinkingUrl));
		};

		if (mainWindow.isMinimized()) {
			mainWindow.restore();
		};

		mainWindow.show();
		mainWindow.focus();
	};
});

app.on('window-all-closed', (e) => {
	Util.log('info', 'window-all-closed');

	if (is.linux) {
		e.preventDefault();
		exit(false);
	};
});

app.on('before-quit', (e) => {
	Util.log('info', 'before-quit');

	if (app.isQuiting) {
		app.exit(0);
	} else {
		e.preventDefault();
		exit(false);
	};
});

app.on('activate', () => { mainWindow ? mainWindow.show() : createMainWindow(); });

app.on('open-url', (e, url) => {
	e.preventDefault();

	if (mainWindow) {
		Util.send(mainWindow, 'route', Util.getRouteFromUrl(url));
		mainWindow.show();
	};
});

function shutdown (relaunch) {
	Util.log('info', 'AppShutdown, relaunch: ' + relaunch);

	if (relaunch) {
		UpdateManager.relaunch();
	} else {
		app.exit(0);
	};
};

function exit (relaunch) {
	if (app.isQuiting) {
		return;
	};

	Util.log('info', 'MW shutdown is starting, relaunch: ' + relaunch);
	Util.send(mainWindow, 'shutdownStart');

	Server.stop().then(()=>{
		Util.log('info', 'MW shutdown complete');
		shutdown(relaunch);
	});
};