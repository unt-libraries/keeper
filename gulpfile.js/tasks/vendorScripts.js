const gulp = require('gulp');
const config = require('../config').scripts;

function vendorScripts() {
  const paths = Object.values(config.common_libs);

  return gulp.src(paths)
      .pipe(gulp.dest(config.vendor_dest));
}

module.exports = {
  vendorScripts,
}
