require('dotenv').config();
const path = require('node:path');

const platformArgIndex = process.argv.findIndex((arg) => arg === '--platform');
const platformFromArgs = platformArgIndex >= 0
  ? process.argv[platformArgIndex + 1]
  : process.argv.find((arg) => arg.startsWith('--platform='))?.split('=')[1];
const forgePlatform = process.env.FORGE_PLATFORM || process.env.npm_config_platform || platformFromArgs;
const isMasBuild = forgePlatform === 'mas';
const forgeOutDir = process.env.FORGE_OUT_DIR;
const signingIdentity = isMasBuild
  ? process.env.APPLE_MAS_CERTIFICATE_IDENTITY
  : process.env.APPLE_CERTIFICATE_IDENTITY;
const masInstallerIdentity = process.env.APPLE_MAS_INSTALLER_CERTIFICATE_IDENTITY;
const provisioningProfile = isMasBuild && process.env.APPLE_MAS_PROVISIONING_PROFILE
  ? path.isAbsolute(process.env.APPLE_MAS_PROVISIONING_PROFILE)
    ? process.env.APPLE_MAS_PROVISIONING_PROFILE
    : path.join(__dirname, process.env.APPLE_MAS_PROVISIONING_PROFILE)
  : undefined;
const entitlementsFile = isMasBuild ? 'entitlements.mas.plist' : 'entitlements.plist';
const entitlementsInheritFile = isMasBuild ? 'entitlements.mas.inherit.plist' : 'entitlements.plist';

module.exports = {
  outDir: forgeOutDir,
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
    osxSign: signingIdentity ? {
      identity: signingIdentity,
      hardenedRuntime: !isMasBuild,
      provisioningProfile,
      entitlements: entitlementsFile,
      'entitlements-inherit': entitlementsInheritFile,
    } : undefined,
    osxNotarize: !isMasBuild && process.env.APPLE_CERTIFICATE_IDENTITY && process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID ? {
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
      appBundleId: 'cn.com.mirrospeak',
    } : undefined,
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config:{}
    },
    {
      name: '@electron-forge/maker-pkg',
      platforms: ['mas'],
      config: {
        identity: masInstallerIdentity,
      }
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
