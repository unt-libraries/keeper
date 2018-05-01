/*
 gulpfile.js
 ===========
 Add new tasks by creating a new .js file in gulp/tasks.
 Add configuration variables to gulp/config.js
 Add utilities in gulp/util

 adapted from https://github.com/greypants/gulp-starter

 */


const requireDir = require('require-dir');

// Require all tasks in gulp/tasks, including subfolders
requireDir('./gulp/tasks', { recurse: true });
