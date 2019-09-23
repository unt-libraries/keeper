const gulp = require('gulp');
const sass = require('./sass');
const scripts = require('./scripts');

gulp.task('default', gulp.parallel('sass:watch', 'scripts:watch'));

