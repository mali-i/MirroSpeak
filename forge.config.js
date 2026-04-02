require('dotenv').config();
const path = require('node:path');
const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
    executableName: 'MirroSpeak',
    appBundleId: 'cn.com.mirrospeak',
    icon: path.join(__dirname, 'assets', 'icons', 'icon'),
    extendInfo: {
      CFBundleName: 'MirroSpeak',
      CFBundleDisplayName: 'MirroSpeak',
      NSCameraUsageDescription: 'Application needs access to the camera for video recording.',
      NSMicrophoneUsageDescription: 'Application needs access to the microphone for audio recording.',
      NSCameraUseContinuityCameraDeviceType: true
    },
    osxSign: process.env.APPLE_CERTIFICATE_IDENTITY ? {
      identity: process.env.APPLE_CERTIFICATE_IDENTITY,
      hardenedRuntime: true,
      entitlements: 'entitlements.plist',
      'entitlements-inherit': 'entitlements.plist',
    } : undefined,
    osxNotarize: process.env.APPLE_CERTIFICATE_IDENTITY && process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID ? {
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
      appBundleId: 'cn.com.mirrospeak',
    } : undefined,
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {},
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-dmg',
      config:{}
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-vite',
      config: {
        // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
        // If you are familiar with Vite configuration, it will look really familiar.
        build: [
          {
            // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
            entry: 'src/main.js',
            config: 'vite.main.config.mjs',
            target: 'main',
          },
          {
            entry: 'src/preload.js',
            config: 'vite.preload.config.mjs',
            target: 'preload',
          },
        ],
        renderer: [
          {
            name: 'main_window',
            config: 'vite.renderer.config.mjs',
          },
        ],
      },
    },
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'mali-i',
          name: 'MirroSpeak'
        },
        prerelease: false,
        draft: true
      }
    }
  ]
};
