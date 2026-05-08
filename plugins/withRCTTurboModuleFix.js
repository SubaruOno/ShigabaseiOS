const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

const PLUGIN_NAME = 'withRCTTurboModuleFix';
const TARGET_RELATIVE_PATH =
  'node_modules/react-native/ReactCommon/react/nativemodule/core/platform/ios/ReactCommon/RCTTurboModule.mm';
const THROW_LINE =
  'throw convertNSExceptionToJSError(runtime, exception, std::string{moduleName}, methodNameStr);';
const REPLACEMENT = [
  'NSLog(@"[RCTTurboModule] Suppressed NSException in void method \'%s.%s\': %@",',
  '      moduleName, methodName, exception);',
].join('\n');

module.exports = function withRCTTurboModuleFix(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const targetPath = path.join(config.modRequest.projectRoot, TARGET_RELATIVE_PATH);

      if (!fs.existsSync(targetPath)) {
        console.log(`[${PLUGIN_NAME}] Skipping: file not found at ${targetPath}`);
        return config;
      }

      const source = fs.readFileSync(targetPath, 'utf8');

      if (source.includes(REPLACEMENT)) {
        console.log(`[${PLUGIN_NAME}] Skipping: RCTTurboModule.mm already patched`);
        return config;
      }

      if (!source.includes(THROW_LINE)) {
        console.log(`[${PLUGIN_NAME}] Skipping: target throw line not found in RCTTurboModule.mm`);
        return config;
      }

      const updatedSource = source.replace(THROW_LINE, REPLACEMENT);
      fs.writeFileSync(targetPath, updatedSource);
      console.log(`[${PLUGIN_NAME}] Patched RCTTurboModule.mm to suppress void TurboModule NSExceptions`);

      return config;
    },
  ]);
};
