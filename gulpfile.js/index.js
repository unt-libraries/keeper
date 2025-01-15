const gulp = require('gulp');

const { sass, sassWatch } = require('./tasks/sass');
const { scripts, scriptsWatch } = require('./tasks/scripts');
const { vendorScripts } = require("./tasks/vendorScripts");

module.exports = {
  default: gulp.parallel(sassWatch, scriptsWatch, vendorScripts),
  sass,
  sassWatch,
  scripts,
  scriptsWatch,
  vendorScripts,
}
