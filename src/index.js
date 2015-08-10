'use strict';

let _ = require('lodash');
let util = require('kinda-util').create();
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

  this.initialize = async function() {
    if (this.connection) return;
    let timestamp = Date.now();
    while (!this.connection) {
      await util.timeout(200);
      if (Date.now() - timestamp > 5000) {
        throw new Error('initialization of KindaCordovaSQLite failed (Cordova didn\'t start after 5 seconds)');
      }
    }
  };

  this.lock = async function(fn) {
    await this.awaitLock.acquireAsync();
    try {
      await this.initialize();
      return await fn();
    } finally {
      this.awaitLock.release();
    }
  };

  this.query = async function(sql, values) {
    return await this.lock(async function() {
      return await this._query(sql, values);
    }.bind(this));
  };

  this._query = async function(sql, values) {
    values = this.normalizeValues(values);
    let result = await this.__query(sql, values);
    result = this.normalizeResult(result);
    return result;
  };

  this.__query = function(sql, values) {
    // console.log(sql, JSON.stringify(values));
    return new Promise((resolve, reject) => {
      this.connection.query(sql, values, function(err, res) {
        if (err) reject(err); else resolve(res);
      });
    });
  };

  this.transaction = async function(fn) {
    return await this.lock(async function() {
      await this._query('BEGIN');
      try {
        let result = await fn({ query: this._query.bind(this) });
        await this._query('COMMIT');
        return result;
      } catch (err) {
        await this._query('ROLLBACK');
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
