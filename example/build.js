'use strict';

// ./node_modules/.bin/babel-node example/build.js

let fs = require('fs');
let browserify = require('browserify');
let babelify = require('babelify');

function build() {
  fs.createReadStream('./node_modules/babel-polyfill/dist/polyfill.js').pipe(fs.createWriteStream('./example/cordova-app/www/polyfill.js'));

  browserify({ debug: true })
    .transform(babelify)
    .require('./example/index.js', { entry: true })
    .bundle()
    .on('error', console.error.bind(console))
    .pipe(fs.createWriteStream('./example/cordova-app/www/bundle.js'));
}

build();
