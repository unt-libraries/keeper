const gulp = require('gulp');
const gulpSass = require('gulp-sass')(require('sass'));
const rename = require('gulp-rename');
const sourcemaps = require('gulp-sourcemaps');
const config = require('../config').sass;

function sass() {
  return gulp.src(config.src)
    .pipe(sourcemaps.init())
    .pipe(gulpSass({
      style: 'compressed',
      loadPaths: ['node_modules'],
    }).on('error', gulpSass.logError))
    .pipe(rename({
      extname: '.min.css',
    }))
    .pipe(sourcemaps.write('./'))
    .pipe(gulp.dest(config.dest));
}

function sassWatch() {
  return gulp.watch(`${config.srcdir}*.scss`, sass);
}

module.exports = {
  sass,
  sassWatch,
}
