// Webpack plugin to convert dynamic imports to static ones
export default class StaticImportsPlugin {
  apply(compiler) {
    compiler.hooks.compilation.tap('StaticImportsPlugin', (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: 'StaticImportsPlugin',
          stage: compilation.PROCESS_ASSETS_STAGE_OPTIMIZE
        },
        (assets) => {
          for (const filename in assets) {
            if (filename.endsWith('.js') || filename.endsWith('.cjs')) {
              let content = assets[filename].source();
              
              // Replace dynamic imports with static requires
              content = content.replace(
                /await\s+import\(['"]\.\/sync\.js['"]\)/g,
                "Promise.resolve(require('./sync.js'))"
              );
              content = content.replace(
                /await\s+import\(['"]\.\/purge\.js['"]\)/g,
                "Promise.resolve(require('./purge.js'))"
              );
              
              // Update the asset
              assets[filename] = {
                source: () => content,
                size: () => content.length
              };
            }
          }
        }
      );
    });
  }
}