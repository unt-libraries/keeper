const browserify = require('browserify');
const gulp = require('gulp');
const handleErrors = require('../util/handleErrors');
const source = require('vinyl-source-stream');
const buffer = require('vinyl-buffer');
const uglify = require('gulp-uglify');
const sourcemaps = require('gulp-sourcemaps');
const config = require('../config').browserify;

function scripts() {
  return browserify(config)
    .bundle()
    .on('error', handleErrors)
    .pipe(source(config.outputName))
    .pipe(buffer())
    .pipe(sourcemaps.init({loadMaps: true}))
    .pipe(uglify(config.uglify))
    .on('error', handleErrors)
    .pipe(sourcemaps.write('./'))
    .pipe(gulp.dest(config.dest));
}

function scriptsWatch() {
  return gulp.watch(config.src, gulp.series(scripts));
}

module.exports = {
  scripts,
  scriptsWatch,
}
