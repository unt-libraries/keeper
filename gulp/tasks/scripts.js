const browserify = require('browserify');
const watchify = require('watchify');
const mergeStream = require('merge-stream');
const bundleLogger = require('./util/bundleLogger');
const gulp = require('gulp');
const handleErrors = require('./util/handleErrors');
const source = require('vinyl-source-stream');
const buffer = require('vinyl-buffer');
const _ = require('lodash');
const uglify = require('gulp-uglify');
const sourcemaps = require('gulp-sourcemaps');
const config = require('../config').browserify;

const browserifyTask = (devMode) => {
  const browserifyThis = (bundleConfig) => {
    if (devMode) {
      // Add watchify args and debug (sourcemaps) option
      _.extend(bundleConfig, watchify.args, { debug: true });
      // A watchify require/external bug that prevents proper recompiling,
      // so (for now) we'll ignore these options during development. Running
      // `gulp scripts` directly will properly require and externalize.
      bundleConfig = _.omit(bundleConfig, ['external', 'require']);
    }

    let b = browserify(bundleConfig);

    const bundle = () => {
      // Log when bundling starts
      bundleLogger.start(bundleConfig.outputName);

      return b
        .bundle()
        .on('error', handleErrors)
        .pipe(source(bundleConfig.outputName))
        .pipe(buffer())
        .pipe(sourcemaps.init({ loadMaps: true }))
          .pipe(uglify(bundleConfig.uglify))
          .on('error', handleErrors)
        .pipe(sourcemaps.write('./'))
        .pipe(gulp.dest(bundleConfig.dest));
    };

    if (devMode) {
      // Wrap with watchify and rebundle on changes
      b = watchify(b);
      // Rebundle on update
      b.on('update', bundle);
      bundleLogger.watch(bundleConfig.outputName);
    } else {
      // Sort out shared dependencies. b.require exposes modules externally
      if (bundleConfig.require) b.require(bundleConfig.require);
      // b.external excludes modules from the bundle, and expects they'll be available externally
      if (bundleConfig.external) b.external(bundleConfig.external);
    }

    return bundle();
  };

  // Start bundling with Browserify for each bundleConfig specified
  return mergeStream.apply(gulp, _.map(config.bundleConfigs, browserifyThis));
};

gulp.task('scripts', () => browserifyTask());

// Start browserify task with devMode === true
gulp.task('scripts:watch', () => browserifyTask(true));
