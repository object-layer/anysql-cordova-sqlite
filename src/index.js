'use strict';

let _ = require('lodash');
let wait = require('co-wait');
let AwaitLock = require('await-lock');
let KindaObject = require('kinda-object');

let KindaCordovaSQLite = KindaObject.extend('KindaCordovaSQLite', function() {
  this.creator = function(options = {}) {
    if (!options.name) throw new Error('Cordova SQLite database name is missing');
    this.awaitLock = new AwaitLock();
    document.addEventListener('deviceready', () => {
      let sqlite = window.cordova.require('io.kinda.cordova-sqlite-plugin.sqlite');
      let connection = sqlite.createConnection(options.name);
      connection.connect(err => {
        if (err) throw err;
        this.connection = connection;
      });
    }, false);
  };

  this.initialize = function *() {
    if (this.connection) return;
    let timestamp = Date.now();
    while (!this.connection) {
      yield wait(200);
      if (Date.now() - timestamp > 5000) {
        throw new Error('initialization of KindaCordovaSQLite failed (Cordova didn\'t start after 5 seconds)');
      }
    }
  };

  this.lock = function *(fn) {
    yield this.awaitLock.acquireAsync();
    try {
      yield this.initialize();
      return yield fn();
    } finally {
      this.awaitLock.release();
    }
  };

  this.query = function *(sql, values) {
    return yield this.lock(function *() {
      return yield this._query(sql, values);
    }.bind(this));
  };

  this._query = function *(sql, values) {
    values = this.normalizeValues(values);
    let result = yield function(callback) {
      // console.log(sql, JSON.stringify(values));
      this.connection.query(sql, values, callback);
    }.bind(this);
    result = this.normalizeResult(result);
    return result;
  };

  this.transaction = function *(fn) {
    return yield this.lock(function *() {
      yield this._query('BEGIN');
      try {
        let result = yield fn({ query: this._query.bind(this) });
        yield this._query('COMMIT');
        return result;
      } catch (err) {
        yield this._query('ROLLBACK');
        throw err;
      }
    }.bind(this));
  };

  this.normalizeValues = function(values) {
    if (values && values.length) {
      values = _.map(values, function(val) {
        if (typeof val === 'undefined') val = null;
        else if (Buffer.isBuffer(val)) val = 'bin!' + val.toString('hex');
        return val;
      });
    }
    return values;
  };

  this.normalizeResult = function(result) {
    if (!result) return result;
    let normalizedResult = [];
    if (result.insertId != null) {
      normalizedResult.insertId = result.insertId;
    }
    if (result.rowsAffected != null) {
      normalizedResult.affectedRows = result.rowsAffected;
    }
    if (!result.rows) return normalizedResult;
    for (let row of result.rows) {
      let normalizedRow = {};
      _.forOwn(row, function(val, key) { // eslint-disable-line no-loop-func
        if (val && val.substr && val.substr(0, 4) === 'bin!') {
          val = new Buffer(val.substr(4), 'hex');
        }
        normalizedRow[key] = val;
      });
      normalizedResult.push(normalizedRow);
    }
    return normalizedResult;
  };
});

module.exports = KindaCordovaSQLite;
