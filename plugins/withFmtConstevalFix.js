const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

const PLUGIN_NAME = 'withFmtConstevalFix';
const MARKER = '# [withFmtConstevalFix]';

// Xcode 26 (Apple clang 17+) rejects fmt 11.0's consteval format strings
// ("call to consteval function ... is not a constant expression").
// fmt/base.h sets FMT_USE_CONSTEVAL without an #ifndef guard, so a -D flag
// cannot override it; rewrite the header after every `pod install` instead.
const RUBY_SNIPPET = `
    ${MARKER} Xcode 26: disable consteval in fmt (see plugins/withFmtConstevalFix.js)
    fmt_base = File.join(installer.sandbox.root, 'fmt', 'include', 'fmt', 'base.h')
    if File.exist?(fmt_base)
      src = File.read(fmt_base)
      fixed = src.gsub(/(#\\s*define FMT_USE_CONSTEVAL) 1/, '\\\\1 0')
      if fixed != src
        File.chmod(0644, fmt_base)
        File.write(fmt_base, fixed)
      end
    end
`;

module.exports = function withFmtConstevalFix(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      if (!fs.existsSync(podfilePath)) {
        console.log(`[${PLUGIN_NAME}] Skipping: Podfile not found`);
        return config;
      }

      let podfile = fs.readFileSync(podfilePath, 'utf8');
      if (podfile.includes(MARKER)) {
        console.log(`[${PLUGIN_NAME}] Already patched, skipping`);
        return config;
      }

      const anchor = /post_install do \|installer\|\n/;
      if (!anchor.test(podfile)) {
        console.warn(`[${PLUGIN_NAME}] post_install block not found; fmt fix not applied`);
        return config;
      }

      podfile = podfile.replace(anchor, (m) => m + RUBY_SNIPPET);
      fs.writeFileSync(podfilePath, podfile);
      console.log(`[${PLUGIN_NAME}] Added fmt consteval fix to Podfile`);
      return config;
    },
  ]);
};
