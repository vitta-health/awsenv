import fs from 'fs';
import path from 'path';

export default class InlineModulesPlugin {
  apply(compiler) {
    compiler.hooks.emit.tapAsync('InlineModulesPlugin', (compilation, callback) => {
      // Get the main bundle
      const mainAsset = compilation.assets['bundle.cjs'];
      if (!mainAsset) {
        callback();
        return;
      }

      let content = mainAsset.source();
      
      // List of local modules to inline
      const modules = [
        './app.js',
        './concerns/msgs.js', 
        './profiles.js',
        './sync.js',
        './purge.js',
        './vendor/aws-ssm.js',
        './lib/env-parser.js'
      ];

      // Read and inline each module
      modules.forEach(modulePath => {
        const fullPath = path.join(compiler.context, 'src', modulePath);
        
        if (fs.existsSync(fullPath)) {
          const moduleContent = fs.readFileSync(fullPath, 'utf8');
          
          // Create a module wrapper similar to webpack's
          const wrappedModule = `
(function() {
  var module = { exports: {} };
  var exports = module.exports;
  ${moduleContent}
  return module.exports;
})()`;

          // Replace all requires of this module
          const requirePattern = new RegExp(`require\\(["']${modulePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']\\)`, 'g');
          content = content.replace(requirePattern, wrappedModule);
        }
      });

      // Update the asset
      compilation.assets['bundle.cjs'] = {
        source: () => content,
        size: () => content.length
      };

      callback();
    });
  }
}