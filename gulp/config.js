const appname = 'keeper';
const dest = `./${appname}/static/${appname}`;
const src = './src';
const vendor = './node_modules';

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
      bootstrap: `${vendor}/bootstrap-sass/assets/javascripts/bootstrap.min.js`,
      dropzone: `${vendor}/dropzone-js/dist/min/dropzone.min.js`,
      html5shiv: `${vendor}/html5shiv/dist/html5shiv.min.js`,
      jquery: `${vendor}/jquery/dist/jquery.min.js`,
      parsleyjs: `${vendor}/parsleyjs/dist/parsley.min.js`,
      respondjs: `${vendor}/respond.js/dest/respond.min.js`,
    },
  },
  browserify: {
    // A separate bundle will be generated for each bundle config in the list below
    bundleConfigs: [{
      entries: `${src}/js/scripts.js`,
      transform: [
        ['babelify', {
          presets: [
            ['env', {
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
      dest: `${dest}/js`,
      outputName: 'scripts.min.js',
      // list of externally available modules to exclude from the bundle
      external: ['jquery'],
      // options to pass into uglify
      uglify: {},
    },
    ],
  },
};
