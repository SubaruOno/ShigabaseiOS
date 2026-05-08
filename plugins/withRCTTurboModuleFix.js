const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

const PLUGIN_NAME = 'withRCTTurboModuleFix';
const TARGET_PATH =
  'node_modules/react-native/ReactCommon/react/nativemodule/core/platform/ios/ReactCommon/RCTTurboModule.mm';

const SUPPRESS_COMMENT =
  '      // iOS 26: NSExceptions from TurboModule methods cause Hermes GC heap corruption.\n' +
  '      // Suppress and log instead of re-throwing (both sync and async paths).\n' +
  "      NSLog(@\"[RCTTurboModule] Suppressed NSException in method '%s.%s': %@\",\n" +
  '            moduleName, methodName, exception);';

// Pattern 1: new source with isSync check (RN 0.81 current source)
const PATTERN_ISSYNC =
  '      if (isSync) {\n' +
  '        // We can only convert NSException to JSError in sync method calls.\n' +
  '        // See https://github.com/reactwg/react-native-new-architecture/discussions/276#discussioncomment-12567155\n' +
  '        throw convertNSExceptionToJSError(runtime, exception, std::string{moduleName}, methodNameStr);\n' +
  '      } else {\n' +
  '        @throw exception;\n' +
  '      }';

// Pattern 2: old source without isSync check (pre-built binary era)
const PATTERN_OLD_THROW =
  '      throw convertNSExceptionToJSError(runtime, exception, std::string{moduleName}, methodNameStr);';

module.exports = function withRCTTurboModuleFix(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const targetPath = path.join(config.modRequest.projectRoot, TARGET_PATH);

      if (!fs.existsSync(targetPath)) {
        console.log(`[${PLUGIN_NAME}] Skipping: file not found`);
        return config;
      }

      let source = fs.readFileSync(targetPath, 'utf8');

      if (source.includes(SUPPRESS_COMMENT)) {
        console.log(`[${PLUGIN_NAME}] Already patched, skipping`);
        return config;
      }

      let patched = false;

      if (source.includes(PATTERN_ISSYNC)) {
        source = source.replace(PATTERN_ISSYNC, SUPPRESS_COMMENT);
        patched = true;
      }

      if (source.includes(PATTERN_OLD_THROW)) {
        source = source.replace(PATTERN_OLD_THROW, SUPPRESS_COMMENT);
        patched = true;
      }

      if (patched) {
        fs.writeFileSync(targetPath, source);
        console.log(`[${PLUGIN_NAME}] Patched RCTTurboModule.mm`);
      } else {
        console.log(`[${PLUGIN_NAME}] No matching pattern found — patch may not be needed`);
      }

      return config;
    },
  ]);
};
