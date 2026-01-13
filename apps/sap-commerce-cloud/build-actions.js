const esbuild = require('esbuild');
const { resolve } = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const manifest = require('./contentful-app-manifest.json');

const env = process.env.NODE_ENV;
const path = `./app-actions/.env${env === 'development' ? `.${env}` : ''}`;

const argv = yargs(hideBin(process.argv)).argv;

const validateFunctions = () => {
  const requiredProperties = ['id', 'path', 'entryFile'];
  const uniqueValues = new Set();

  // Support both 'functions' (new) and 'actions' (legacy) formats
  const items = manifest.functions || manifest.actions || [];

  items.forEach((item) => {
    requiredProperties.forEach((property) => {
      if (!item.hasOwnProperty(property)) {
        throw new Error(`Function/Action with name: '${item.name}' is missing the '${property}' property`);
      }
    });

    const { id, path, entryFile } = item;

    if (uniqueValues.has(id)) {
      throw new Error(`Duplicate id: '${id}'`);
    }
    if (uniqueValues.has(path)) {
      throw new Error(`Duplicate path: '${path}'`);
    }
    if (uniqueValues.has(entryFile)) {
      throw new Error(`Duplicate entryFile path: '${entryFile}'`);
    }

    uniqueValues.add(entryFile);
    uniqueValues.add(path);
    uniqueValues.add(id);
  });
};

const getEntryPoints = () => {
  // Support both 'functions' (new) and 'actions' (legacy) formats
  const items = manifest.functions || manifest.actions || [];

  return items.reduce((result, item) => {
    // Extract just the filename without extension and directory
    const pathParts = item.path.split('/');
    const fileName = pathParts[pathParts.length - 1].split('.')[0];

    result[fileName] = resolve(__dirname, item.entryFile);

    return result;
  }, {});
};

const main = async (watch = false) => {
  try {
    console.log('Building app actions/functions');
    validateFunctions();

    const config = {
      entryPoints: getEntryPoints(),
      minify: false,
      bundle: true,
      platform: 'node',
      outdir: 'build/functions',
      logLevel: 'info',
      format: 'esm',
      target: 'es2022',
      external: ['node:*'],
      keepNames: true,
      banner: {
        js: "import { createRequire } from 'module';const require = createRequire(import.meta.url);",
      },
    };

    if (watch) {
      const context = await esbuild.context(config);
      await context.watch();
    } else {
      await esbuild.build(config);
    }
  } catch (e) {
    console.log('Error building app actions');
    throw Error(e);
  }
};

main(argv._.includes('watch')).then(() => console.log('actions built successfully'));
