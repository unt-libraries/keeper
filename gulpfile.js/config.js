// const { readFileSync } = require(`fs`);
const appname = 'keeper';
const dest = `./${appname}/static/${appname}`;
const src = './src';
const modulesDir = './node_modules';

module.exports = {
  sass: {
    srcdir: `${src}/scss/`,
    src: `${src}/scss/style.scss`,
    dest: `${dest}/css/`,
  },
  uncss: {
    src: `${dest}/css/style.min.css`,
    dest: `${dest}/css/`,
  },
  scripts: {
    src: `${src}/js/scripts.js`,
    dest: `${dest}/js`,
    vendor_dest: `${dest}/js/vendor`,
    common_libs: {
      bootstrap: `${modulesDir}dist/js/bootstrap.bundle.min.js`,
      html5shiv: `${modulesDir}dist/html5shiv.min.js`,
      jquery: `${modulesDir}/dist/jquery.min.js`,
      parsleyjs: `$vendor}/dist/parsley.min.js`,
    },
  },
  browserify: {
    src: `${src}/js/`,
    entries: `${src}/js/scripts.js`,
    transform: [
      ['babelify', {
        presets: [
          ['@babel/preset-env', {
            targets: {
              browsers: [
                  'last 2 version',
                  '> 5% in US',
                  'ie >= 9',
              ],
            },
          }],
        ],
      }],
    ],
    dest: `${dest}/js/`,
    outputName: 'scripts.min.js',
    // list of externally available modules to exclude from the bundle
    external: ['jquery'],
    // options to pass into uglify
    uglify: {},
  },
};
