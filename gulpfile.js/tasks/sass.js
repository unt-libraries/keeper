const gulp = require('gulp');
const gulpSass = require('gulp-sass')(require('sass'));
const rename = require('gulp-rename');
const sourcemaps = require('gulp-sourcemaps');
const pnp = require('pnpapi');
const virtualLocator = pnp.topLevel;
const physicalLocator = pnp.findPackageLocator(pnp.getPackageInformation(virtualLocator).packageLocation);
const modulesDir = physicalLocator.reference;
const config = require('../config').sass;

function sass() {
  return gulp.src(config.src)
    .pipe(sourcemaps.init())
    .pipe(gulpSass({
      outputStyle: 'compressed',
      // Resolve location of dropzone module in Yarn pnp cache so we can import the scss
      includePaths: [`${pnp.resolveToUnqualified('dropzone', modulesDir)}`],
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
