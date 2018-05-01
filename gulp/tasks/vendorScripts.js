const gulp = require('gulp');
const _ = require('lodash');
const config = require('../config').scripts;

gulp.task('vendor-scripts', () => {
  const paths = [];

  _.forEach(config.common_libs, (path) => {
    paths.push(path);
  });

  return gulp.src(paths)
      .pipe(gulp.dest(config.vendor_dest));
});
