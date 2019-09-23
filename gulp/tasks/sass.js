const gulp = require('gulp');
const sass = require('gulp-sass');
const rename = require('gulp-rename');
const sourcemaps = require('gulp-sourcemaps');
const config = require('../config').sass;

const sassTask = gulp.task('sass', () => {
  return gulp.src(config.src)
    .pipe(sourcemaps.init())
    .pipe(sass({ outputStyle: 'compressed' }).on('error', sass.logError))
    .pipe(rename({
      extname: '.min.css',
    }))
    .pipe(sourcemaps.write('./'))
    .pipe(gulp.dest(config.dest));
});

gulp.task('sass:watch', () => gulp.watch(`${config.srcdir} + *.scss`, gulp.series('sass')));
// gulp.task('sass:watch', gulp.series(() => gulp.watch(`${config.srcdir} + *.scss`, 'sass'));